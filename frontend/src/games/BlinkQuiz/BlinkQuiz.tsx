import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutorizacaoCamera, AvisosCamera, PreviaCamera } from '../../components/Camera'
import { useImagensJogo } from '../../components/CarregaImagens'
import { PainelCNN } from '../../components/PainelCNN'
import { Arvore, Gotinha, Robo } from '../../components/Personagens'
import { TelaResultado } from '../../components/Resultado'
import { AnelProgresso, BarraProgresso, Botao, Confetes, IconeOlho } from '../../components/UI'
import { useCamera } from '../../context/CameraContext'
import { useConfig } from '../../context/ConfigContext'
import { CATEGORIAS, nomeClasse } from '../../data/categorias'
import { textoEducativo } from '../../data/educacao'
import { classificarImagem, salvarPontuacao, type PrevisaoCNN } from '../../services/classifierApi'
import { som } from '../../services/som'
import { DIRECOES_CABECA } from '../../vision/blinkDetection'
import { TEXTO_CONFIRMAR, useControleFacial, type ComandoFacial } from '../../vision/useControleFacial'
import { BONUS_SEQUENCIA, montarRodadasQuiz, pontuarQuiz, PONTOS_ACERTO, type RodadaQuiz } from '../sorteio'
import { CalibracaoFacial } from './CalibracaoFacial'

type Etapa = 'camera' | 'calibracao' | 'instrucoes' | 'jogo' | 'resultado'
// preparando: “Prepare-se!” (nenhum gesto vale) · pergunta: escolher · selecionada: confirmar ou trocar
type Fase = 'preparando' | 'pergunta' | 'selecionada' | 'feedback'

const LETRAS = ['A', 'B', 'C', 'D'] as const
const OLHOS: { olho: 'esquerdo' | 'direito'; vezes: 1 | 2 }[] = [
  { olho: 'esquerdo', vezes: 1 },
  { olho: 'direito', vezes: 1 },
  { olho: 'esquerdo', vezes: 2 },
  { olho: 'direito', vezes: 2 },
]
const RODADAS = 10
const BLOQUEIO_FEEDBACK_MS = 2000
/** Tempo de “Prepare-se!” no início de cada pergunta, antes de aceitar gestos. */
const PREPARO_RODADA_MS = 2500

interface Registro {
  imagemId: string
  classe: string
  escolha: string
  acertou: boolean
  pontos: number
  gesto: string
}

interface ResultadoCNN {
  previsao?: PrevisaoCNN
  erro?: string
}

export default function BlinkQuiz() {
  const navigate = useNavigate()
  const { status } = useCamera()
  const { config } = useConfig()
  const { imagens, erro: erroImagens } = useImagensJogo()
  const modo = config.controleFacial

  const [etapa, setEtapa] = useState<Etapa>(status === 'ligada' ? 'calibracao' : 'camera')
  const [rodadas, setRodadas] = useState<RodadaQuiz[]>([])
  const [idx, setIdx] = useState(0)
  const [fase, setFase] = useState<Fase>('preparando')
  const [selecao, setSelecao] = useState<ComandoFacial | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [pontos, setPontos] = useState(0)
  const [sequencia, setSequencia] = useState(0)
  const [bonusAgora, setBonusAgora] = useState(0)
  const [cnn, setCnn] = useState<Record<number, ResultadoCNN>>({})
  const [pausado, setPausado] = useState(false)
  const [liberado, setLiberado] = useState(false)
  const [confete, setConfete] = useState(0)
  const [gestoVisto, setGestoVisto] = useState<string | null>(null)
  /** Aviso rápido "Escolha desfeita". */
  const [desfeito, setDesfeito] = useState(0)
  /** Opção destacada na tela de resultado (0 = jogar de novo, 1 = menu). */
  const [escolhaFinal, setEscolhaFinal] = useState<0 | 1>(0)
  // Alternativa de acessibilidade: jogar com teclado, mouse ou toque
  const [semCamera, setSemCamera] = useState(false)

  // Se a câmera for desligada no meio, volta para a autorização.
  useEffect(() => {
    if (!semCamera && status !== 'ligada' && etapa !== 'camera' && etapa !== 'resultado') setEtapa('camera')
  }, [status, etapa, semCamera])

  const rodada = rodadas[idx]

  const iniciarPartida = useCallback(() => {
    if (!imagens?.length) return
    setRodadas(montarRodadasQuiz(imagens, RODADAS))
    setIdx(0)
    setFase('preparando')
    setSelecao(null)
    setRegistros([])
    setPontos(0)
    setSequencia(0)
    setCnn({})
    setPausado(false)
    setEtapa('jogo')
  }, [imagens])

  // Ao exibir a foto, pede a classificação da CNN para esta rodada.
  useEffect(() => {
    if (etapa !== 'jogo' || !rodada) return
    const i = idx
    classificarImagem(rodada.imagem)
      .then((previsao) => setCnn((c) => ({ ...c, [i]: { previsao } })))
      .catch((e) => setCnn((c) => ({ ...c, [i]: { erro: String(e.message ?? e) } })))
  }, [etapa, idx, rodada])

  const responder = useCallback(
    (c: ComandoFacial) => {
      if (!rodada) return
      const escolha = rodada.opcoes[c.opcao]
      // Gabarito = rótulo verdadeiro do manifesto (NUNCA a previsão da CNN).
      const acertou = escolha === rodada.imagem.classe
      const r = pontuarQuiz(acertou, sequencia)
      setSequencia(r.sequencia)
      setPontos((p) => p + r.pontos + r.bonus)
      setBonusAgora(r.bonus)
      setRegistros((rs) => [
        ...rs,
        { imagemId: rodada.imagem.id, classe: rodada.imagem.classe, escolha, acertou, pontos: r.pontos + r.bonus, gesto: c.descricao },
      ])
      setSelecao(c)
      setFase('feedback')
      setLiberado(false)
      if (acertou) {
        som.acerto()
        setConfete(Date.now())
      } else som.erro()
    },
    [rodada, sequencia],
  )

  const proxima = useCallback(() => {
    if (idx + 1 >= rodadas.length) {
      const acertos = registros.filter((r) => r.acertou).length
      const avaliadas = rodadas.map((r, i) => ({ r, p: cnn[i]?.previsao })).filter((x) => x.p)
      void salvarPontuacao({
        jogo: 'desafio_piscar',
        pontos,
        acertos,
        erros: registros.length - acertos,
        acertos_cnn: avaliadas.filter((x) => x.p!.classe_prevista === x.r.imagem.classe).length,
        total_cnn: avaliadas.length,
      })
      setEtapa('resultado')
      return
    }
    setIdx((i) => i + 1)
    setFase('preparando')
    setSelecao(null)
    setBonusAgora(0)
  }, [idx, rodadas, registros, cnn, pontos])

  // Bloqueio de comandos durante o feedback
  useEffect(() => {
    if (fase !== 'feedback') return
    const t = setTimeout(() => setLiberado(true), BLOQUEIO_FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [fase, idx])

  // Avanço automático opcional (desligado por padrão)
  useEffect(() => {
    if (fase !== 'feedback' || !liberado || !config.avancoAutomaticoMs || pausado) return
    const t = setTimeout(proxima, config.avancoAutomaticoMs)
    return () => clearTimeout(t)
  }, [fase, liberado, config.avancoAutomaticoMs, pausado, proxima])

  // “Prepare-se!”: no começo de cada pergunta nenhum gesto vale.
  useEffect(() => {
    if (etapa !== 'jogo' || fase !== 'preparando' || pausado) return
    const t = setTimeout(() => setFase('pergunta'), PREPARO_RODADA_MS)
    return () => clearTimeout(t)
  }, [etapa, fase, idx, pausado])

  /** Passo 1 — a piscada (ou tecla/clique) só ESCOLHE; nada é registrado ainda. */
  const tratarComando = (c: ComandoFacial) => {
    if (etapa === 'resultado') {
      if (c.opcao === 0 || c.opcao === 1) {
        som.gesto()
        setGestoVisto(c.descricao)
        setEscolhaFinal(c.opcao)
      }
      return
    }
    if (etapa !== 'jogo' || pausado) return
    if (fase === 'pergunta' || fase === 'selecionada') {
      som.gesto()
      setGestoVisto(c.descricao)
      setSelecao(c) // outra piscada troca a escolha
      setFase('selecionada')
    }
  }

  /** Passo 2 — gesto de confirmação (olhos fechados/boca aberta segurados, Enter ou botão). */
  const tratarConfirmar = () => {
    if (etapa === 'instrucoes') {
      som.gesto()
      return iniciarPartida()
    }
    if (etapa === 'resultado') {
      if (escolhaFinal === 0) iniciarPartida()
      else navigate('/jogos')
      return
    }
    if (etapa !== 'jogo') return
    if (pausado) return setPausado(false)
    if (fase === 'selecionada' && selecao) responder(selecao)
    else if (fase === 'feedback' && liberado) {
      som.gesto()
      proxima()
    }
  }
  const confirmarRef = useRef(tratarConfirmar)
  confirmarRef.current = tratarConfirmar

  /** Voltar — desmarca a alternativa escolhida (antes de confirmar). */
  const tratarVoltar = () => {
    if (etapa === 'jogo' && fase === 'selecionada' && !pausado) {
      som.erro()
      setSelecao(null)
      setFase('pergunta')
      setGestoVisto('voltar (desfez a escolha)')
      setDesfeito(Date.now())
    }
  }
  const voltarRef = useRef(tratarVoltar)
  voltarRef.current = tratarVoltar
  useEffect(() => {
    if (!desfeito) return
    const t = setTimeout(() => setDesfeito(0), 2500)
    return () => clearTimeout(t)
  }, [desfeito])

  const tratarRef = useRef(tratarComando)
  tratarRef.current = tratarComando

  const bloqueado = etapa === 'jogo' && (fase === 'preparando' || (fase === 'feedback' && !liberado))
  const controleAtivo = !semCamera && (etapa === 'instrucoes' || etapa === 'jogo' || etapa === 'resultado')
  const facial = useControleFacial(
    controleAtivo,
    bloqueado,
    (c) => tratarRef.current(c),
    () => confirmarRef.current(),
    () => voltarRef.current(),
  )
  const textoConfirmar = semCamera ? 'aperte Enter' : TEXTO_CONFIRMAR[facial.gestoConfirmacao]

  // Teclado: alternativa para quem não consegue fazer os gestos
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mapa: Record<string, 0 | 1 | 2 | 3> = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 }
      const op = mapa[e.key.toLowerCase()]
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        if (etapa === 'jogo') setPausado((p) => !p)
        return
      }
      if (op !== undefined && !(etapa === 'jogo' && bloqueado)) tratarRef.current({ opcao: op, descricao: `tecla ${e.key.toUpperCase()}` })
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        voltarRef.current()
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        confirmarRef.current()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [etapa, fase, liberado, bloqueado])

  /* ------------------------------------------------------------ telas -- */

  if (etapa === 'camera') {
    return (
      <AutorizacaoCamera
        oQue="rosto"
        aoLiberar={() => setEtapa('calibracao')}
        aoVoltar={() => navigate('/jogos')}
        aoSemCamera={() => {
          setSemCamera(true)
          setEtapa('instrucoes')
        }}
      />
    )
  }

  if (etapa === 'calibracao') {
    return <CalibracaoFacial aoConcluir={() => setEtapa('instrucoes')} aoVoltar={() => navigate('/jogos')} />
  }

  const dicaGesto = (i: number) =>
    semCamera ? (
      <span className="dica-cabeca">tecla {LETRAS[i]}</span>
    ) : modo === 'piscadas' ? <IconeOlho olho={OLHOS[i].olho} vezes={OLHOS[i].vezes} /> : <span className="dica-cabeca">{DIRECOES_CABECA[i]}</span>

  const statusGesto = semCamera ? (
    <p className="nota">🎹 Jogando sem câmera: use as teclas A, B, C e D (ou clique/toque) e o Enter para continuar.</p>
  ) : (
    <div className="status-gesto" aria-live="polite">
      <PreviaCamera compacta detectado={facial.rostoVisivel} />
      <AvisosCamera ausente={facial.rostoAusente} oQue="rosto" />
      {facial.piscadas?.pendente && (
        <div className="pendente">
          <AnelProgresso fracao={facial.piscadas.pendente.fracao} tamanho={34} cor="#ff9800" />
          <span>Uma piscada do olho {facial.piscadas.pendente.olho}… pisque de novo se quiser a segunda</span>
        </div>
      )}
      {facial.cabeca?.quadrante != null && (
        <div className="pendente">
          <AnelProgresso fracao={facial.cabeca.progresso} tamanho={34} />
          <span>Apontando {LETRAS[facial.cabeca.quadrante]}</span>
        </div>
      )}
      {facial.confirmacao > 0 && (
        <div className="pendente pendente-confirmar">
          <AnelProgresso fracao={facial.confirmacao} tamanho={34} />
          <span>Confirmando… continue assim!</span>
        </div>
      )}
      {facial.piscadas && !facial.piscadas.pronto && !facial.piscadas.pendente && !bloqueado && etapa === 'jogo' && (
        <div className="pendente pendente-preparo">
          <AnelProgresso fracao={facial.piscadas.preparo} tamanho={34} cor="#29b6f6" />
          <span>{facial.piscadas.movendo ? 'Deixe a cabeça paradinha…' : 'Olhe para a tela com os olhos abertos…'}</span>
        </div>
      )}
      {facial.descartado && <p className="nota">🙈 Esse movimento não contou ({facial.descartado})</p>}
      {gestoVisto && <p className="nota">Último gesto: {gestoVisto}</p>}
    </div>
  )

  if (etapa === 'instrucoes') {
    return (
      <div className="tela-centro">
        <div className="cartao cartao-largo">
          <div className="linha-personagem">
            <Arvore tamanho={110} />
            <div>
              <p className="etapa-rotulo">Desafio do Piscar</p>
              <h2>Como responder</h2>
              <p className="texto-grande">Olhe a foto do material e escolha a categoria certa usando {modo === 'piscadas' ? 'os olhos' : 'a cabeça'}!</p>
            </div>
          </div>
          <div className="grade-instrucoes">
            {LETRAS.map((l, i) => (
              <div key={l} className="instrucao-item">
                <span className="letra">{l}</span>
                {dicaGesto(i)}
                <span>
                  {semCamera
                    ? `tecla ${l} ou clique`
                    : modo === 'piscadas'
                    ? `${OLHOS[i].vezes === 1 ? '1 piscada' : '2 piscadas'} do olho ${OLHOS[i].olho}`
                    : `${DIRECOES_CABECA[i]}${modo === 'boca' ? ' + abrir a boca' : ' e segurar'}`}
                </span>
              </div>
            ))}
          </div>
          <div className="passos-resposta">
            <div>
              <span className="passo-num">1</span> <strong>Escolha</strong>{' '}
              {semCamera ? 'com as teclas A, B, C ou D (ou clicando).' : modo === 'piscadas' ? 'piscando como mostra a tabela acima.' : 'apontando com a cabeça.'} A
              resposta fica marcada, mas ainda não vale.
            </div>
            <div>
              <span className="passo-num">2</span> <strong>Confirme:</strong> {textoConfirmar}.
            </div>
            <div>
              <span className="passo-num">↩</span> <strong>Escolheu errado?</strong>{' '}
              {semCamera ? 'Aperte Backspace (ou o botão Voltar)' : 'Balance a cabeça dizendo “não” 🙅 (ou aperte Backspace)'} para desmarcar,
              ou escolha outra alternativa. Dá para fazer isso enquanto ainda não confirmou.
            </div>
          </div>
          {modo === 'piscadas' && !semCamera && (
            <p className="nota">
              Pode piscar normalmente: piscar os dois olhos rapidinho não conta. Antes de cada pergunta, o jogo espera você ficar com os
              olhos abertos e a cabeça parada. Para a piscada dupla, pisque duas vezes seguidas (em menos de {(config.janelaDuplaMs / 1000).toFixed(1)} s).
            </p>
          )}
          {erroImagens && <p className="alerta">Não consegui carregar as fotos ({erroImagens}). Confira se o servidor do jogo está ligado.</p>}
          {imagens && imagens.length === 0 && <p className="alerta">Ainda não há fotos cadastradas para o jogo.</p>}
          <div className="comecar-gesto">
            <Gotinha tamanho={64} humor="animado" />
            <p className="texto-grande">
              <strong>Para começar:</strong> {textoConfirmar}
              {semCamera ? '' : ' (ou aperte Enter)'}.
            </p>
          </div>
          {statusGesto}
          <div className="linha-botoes">
            {!semCamera && (
              <Botao cor="branco" onClick={() => setEtapa('calibracao')}>
                Ajustar de novo
              </Botao>
            )}
            <Botao grande onClick={iniciarPartida} disabled={!imagens?.length}>
              Começar!
            </Botao>
          </div>
        </div>
      </div>
    )
  }

  if (etapa === 'resultado') {
    const acertos = registros.filter((r) => r.acertou).length
    const comCnn = rodadas.map((r, i) => ({ r, c: cnn[i]?.previsao })).filter((x) => x.c)
    return (
      <TelaResultado
        titulo="Desafio do Piscar"
        resumo={{
          pontos,
          maximo: RODADAS * PONTOS_ACERTO + Math.floor(RODADAS / 3) * BONUS_SEQUENCIA,
          acertos,
          erros: registros.length - acertos,
          acertosCnn: comCnn.filter((x) => x.c!.classe_prevista === x.r.imagem.classe).length,
          totalCnn: comCnn.length,
          tempoMedioCnnMs: comCnn.length ? comCnn.reduce((s, x) => s + x.c!.tempo_inferencia_ms, 0) / comCnn.length : undefined,
        }}
        dica={
          <p className="nota">
            {semCamera
              ? 'Tecla A: jogar de novo · Tecla B: voltar ao menu · Enter: confirmar.'
              : modo === 'piscadas'
                ? `Pisque o olho esquerdo para jogar de novo ou o direito para voltar ao menu. Depois, ${textoConfirmar} para confirmar.`
                : `Aponte ↖ para jogar de novo ou ↗ para voltar ao menu. Depois, ${textoConfirmar} para confirmar.`}
          </p>
        }
        acoes={
          <>
            <Botao cor="branco" className={escolhaFinal === 1 ? 'mao-hover' : ''} onClick={() => navigate('/jogos')}>
              Menu {semCamera ? '(B)' : modo === 'piscadas' ? '(olho direito)' : '(↗)'}
            </Botao>
            <Botao grande className={escolhaFinal === 0 ? 'mao-hover' : ''} onClick={iniciarPartida}>
              Jogar de novo {semCamera ? '(A)' : modo === 'piscadas' ? '(olho esquerdo)' : '(↖)'}
            </Botao>
          </>
        }
      />
    )
  }

  /* ---------------------------------------------------- partida -------- */
  if (!rodada) return null
  const info = CATEGORIAS[rodada.imagem.classe]
  const edu = textoEducativo(rodada.imagem.classe)
  const ultimo = registros[registros.length - 1]
  const resCnn = cnn[idx]

  return (
    <div className="tela-jogo">
      <Confetes disparo={confete} />
      <header className="hud">
        <span className="hud-titulo">Desafio do Piscar</span>
        <BarraProgresso atual={idx} total={rodadas.length} />
        <span className="hud-pontos">⭐ {pontos}</span>
        {sequencia >= 2 && <span className="hud-sequencia">🔥 {sequencia} seguidas</span>}
        <span className={`hud-camera ${facial.rostoVisivel ? 'ok' : ''}`} title="Estou vendo o seu rosto">
          {semCamera ? '🖱️' : facial.rostoVisivel ? '🙂' : '❔'}
        </span>
        <Botao cor="branco" onClick={() => setPausado(true)} aria-label="Pausar (Esc)">
          ⏸ Pausa
        </Botao>
      </header>

      <main className="quiz">
        <div className="quiz-centro">
          <div className="foto-residuo">
            <img src={rodada.imagem.url} alt="Foto de um material" />
          </div>
          <h2 className="pergunta">Qual é a categoria deste resíduo?</h2>
          {fase === 'preparando' && (
            <div className="faixa-preparo" role="status">
              <Gotinha tamanho={48} humor="feliz" />
              <span>
                <strong>Prepare-se!</strong> Olhe a foto com calma. Ainda não precisa responder…
              </span>
            </div>
          )}
          {desfeito > 0 && fase === 'pergunta' && <p className="faixa-pronto faixa-desfeito">↩ Pronto, desmarquei. Pode escolher de novo!</p>}
          {fase === 'pergunta' && !semCamera && !desfeito && facial.piscadas?.pronto && (
            <p className="faixa-pronto">✅ Agora pode escolher!</p>
          )}
          <div className="grade-alternativas">
            {rodada.opcoes.map((c, i) => {
              const escolhida = selecao?.opcao === i && fase !== 'pergunta'
              const correta = fase === 'feedback' && i === rodada.correta
              const errada = fase === 'feedback' && escolhida && !correta
              return (
                <button
                  key={i}
                  className={`alternativa ${escolhida ? 'escolhida' : ''} ${correta ? 'correta' : ''} ${errada ? 'errada' : ''} ${
                    facial.cabeca?.quadrante === i && fase !== 'feedback' ? 'apontada' : ''
                  }`}
                  onClick={() =>
                    fase === 'selecionada' && selecao?.opcao === i
                      ? tratarConfirmar()
                      : tratarComando({ opcao: i as 0 | 1 | 2 | 3, descricao: 'clique/toque' })
                  }
                  disabled={fase === 'feedback' || fase === 'preparando'}
                >
                  <span className="letra">{LETRAS[i]}</span>
                  <span className="alt-emoji" aria-hidden>
                    {CATEGORIAS[c].emoji}
                  </span>
                  <span className="alt-nome">{nomeClasse(c)}</span>
                  {dicaGesto(i)}
                </button>
              )
            })}
          </div>
        </div>
        <aside className="quiz-lateral">{statusGesto}</aside>
      </main>

      {fase === 'selecionada' && selecao && (
        <div className="faixa-confirmacao" role="status">
          <AnelProgresso fracao={facial.confirmacao} tamanho={44} cor="#4caf50" />
          <div>
            <p>
              Você escolheu <strong>{LETRAS[selecao.opcao]} — {nomeClasse(rodada.opcoes[selecao.opcao])}</strong>
              <span className="nota"> ({selecao.descricao})</span>
            </p>
            <p>
              <strong>Para confirmar, {textoConfirmar}.</strong>
            </p>
            <p>
              Marcou errado? {semCamera ? 'Aperte Backspace' : 'Balance a cabeça dizendo “não” 🙅'} para desmarcar, ou escolha outra alternativa.
            </p>
          </div>
          <div className="faixa-botoes">
            <Botao cor="branco" onClick={tratarVoltar}>
              ↩ Voltar
            </Botao>
            <Botao onClick={tratarConfirmar}>✔ Confirmar</Botao>
          </div>
        </div>
      )}

      {fase === 'feedback' && ultimo && (
        <div className="feedback-overlay">
          <div className={`cartao feedback ${ultimo.acertou ? 'feedback-certo' : 'feedback-errado'}`}>
            <div className="linha-personagem">
              <Gotinha tamanho={80} humor={ultimo.acertou ? 'animado' : 'pensando'} />
              <div>
                <h2>{ultimo.acertou ? 'Você acertou! 🎉' : 'Quase lá!'}</h2>
                <p className="texto-grande">
                  {ultimo.acertou ? (
                    <>
                      +{PONTOS_ACERTO} pontos{bonusAgora ? ` e mais ${bonusAgora} de bônus por acertar 3 seguidas! 🔥` : ''}
                    </>
                  ) : (
                    <>
                      Você escolheu {nomeClasse(ultimo.escolha)}, mas a resposta certa é{' '}
                      <strong>
                        {info.emoji} {info.nome}
                      </strong>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="educativo" style={{ borderColor: info.corLixeira }}>
              <p>
                <strong>{info.nome}:</strong> {edu?.dica}
              </p>
              <p>
                ♻️ {edu?.destino} <span className="lixeira" style={{ background: info.corLixeira }}>{info.lixeira}</span>
              </p>
            </div>
            <PainelCNN
              previsao={resCnn?.previsao}
              erro={resCnn?.erro}
              classeVerdadeira={rodada.imagem.classe}
            />
            <p className="continuar">
              {liberado ? `Para continuar, ${textoConfirmar}${semCamera ? '' : ' (ou aperte Enter)'}.` : 'Leia com calma…'}
            </p>
            {liberado && facial.confirmacao > 0 && (
              <div className="pendente pendente-confirmar">
                <AnelProgresso fracao={facial.confirmacao} tamanho={34} />
                <span>Continuando…</span>
              </div>
            )}
            <div className="linha-botoes">
              <Botao onClick={proxima} disabled={!liberado}>
                {idx + 1 >= rodadas.length ? 'Ver resultado' : 'Próxima →'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {pausado && (
        <div className="feedback-overlay">
          <div className="cartao feedback">
            <div className="linha-personagem">
              <Robo tamanho={90} humor="feliz" />
              <div>
                <h2>Jogo pausado</h2>
                <p className="texto-grande">Para continuar, {textoConfirmar} (ou aperte Esc).</p>
              </div>
            </div>
            <div className="linha-botoes">
              <Botao cor="branco" onClick={() => navigate('/jogos')}>
                Sair do jogo
              </Botao>
              <Botao grande onClick={() => setPausado(false)}>
                ▶ Continuar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
