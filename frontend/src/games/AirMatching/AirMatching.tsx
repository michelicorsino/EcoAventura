import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutorizacaoCamera, AvisosCamera, PreviaCamera } from '../../components/Camera'
import { useImagensJogo } from '../../components/CarregaImagens'
import { CamadaMaoClicavel, CursorIlustrado } from '../../components/CursorMao'
import { PainelCNN } from '../../components/PainelCNN'
import { Arvore, Muda, Robo } from '../../components/Personagens'
import { TelaResultado } from '../../components/Resultado'
import { BarraProgresso, Botao, Confetes } from '../../components/UI'
import { useCamera } from '../../context/CameraContext'
import { useConfig } from '../../context/ConfigContext'
import { CATEGORIAS, nomeClasse, type Classe } from '../../data/categorias'
import { textoEducativo } from '../../data/educacao'
import { classificarImagem, salvarPontuacao, type ImagemJogo, type PrevisaoCNN } from '../../services/classifierApi'
import { som } from '../../services/som'
import { alvoSobCursor, useCursorMao } from '../../vision/useCursorMao'
import { BONUS_RODADA_PERFEITA, montarRodadasConexao, PONTOS_CONEXAO, type RodadaConexao } from '../sorteio'
import { CalibracaoMao } from './CalibracaoMao'

type Etapa = 'camera' | 'calibracao' | 'instrucoes' | 'jogo' | 'rodada_completa' | 'resultado'
const RODADAS = 5
const TOLERANCIA_ENCAIXE = 40 // px de tolerância ao soltar sobre um cartão/conector

interface Ponto {
  x: number
  y: number
}
interface Mensagem {
  tipo: 'certo' | 'errado' | 'info'
  texto: string
  imagem?: ImagemJogo
}

export default function AirMatching() {
  const navigate = useNavigate()
  const { status } = useCamera()
  const { config } = useConfig()
  const { imagens, erro: erroImagens } = useImagensJogo()
  const usarPinca = config.controleMao === 'pinca'

  const [etapa, setEtapa] = useState<Etapa>(status === 'ligada' ? 'calibracao' : 'camera')
  const [rodadas, setRodadas] = useState<RodadaConexao[]>([])
  const [idx, setIdx] = useState(0)
  const [conexoes, setConexoes] = useState<Record<string, Classe>>({})
  const [arrasto, setArrasto] = useState<string | null>(null) // id da imagem de origem
  const [linhaErrada, setLinhaErrada] = useState<{ de: string; para: Classe } | null>(null)
  const [pontos, setPontos] = useState(0)
  const [acertos, setAcertos] = useState(0)
  const [errosRodada, setErrosRodada] = useState(0)
  const [errosTotal, setErrosTotal] = useState(0)
  const [rodadasPerfeitas, setRodadasPerfeitas] = useState(0)
  const [cnn, setCnn] = useState<Record<string, { previsao?: PrevisaoCNN; erro?: string }>>({})
  const [msg, setMsg] = useState<Mensagem | null>(null)
  const [confete, setConfete] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [progressoPermanencia, setProgressoPermanencia] = useState(0)
  const [pos, setPos] = useState<{ img: Record<string, Ponto>; cat: Record<string, Ponto> }>({ img: {}, cat: {} })
  const [tick, setTick] = useState(0)
  const [cliqueOrigem, setCliqueOrigem] = useState<string | null>(null) // modo mouse/toque
  const [semCamera, setSemCamera] = useState(false)

  const rodada = rodadas[idx]
  const totalConexoes = RODADAS * 4

  useEffect(() => {
    if (!semCamera && status !== 'ligada' && etapa !== 'camera' && etapa !== 'resultado') setEtapa('camera')
  }, [status, etapa, semCamera])

  const iniciar = useCallback(() => {
    if (!imagens) return
    const r = montarRodadasConexao(imagens, RODADAS)
    if (!r.length) return
    setRodadas(r)
    setIdx(0)
    setConexoes({})
    setPontos(0)
    setAcertos(0)
    setErrosRodada(0)
    setErrosTotal(0)
    setRodadasPerfeitas(0)
    setCnn({})
    setMsg(null)
    setArrasto(null)
    setPausado(false)
    setEtapa('jogo')
  }, [imagens])

  // A CNN classifica individualmente cada foto exibida na rodada.
  useEffect(() => {
    if (etapa !== 'jogo' || !rodada) return
    for (const img of rodada.imagens) {
      classificarImagem(img)
        .then((previsao) => setCnn((c) => ({ ...c, [img.id]: { previsao } })))
        .catch((e) => setCnn((c) => ({ ...c, [img.id]: { erro: String(e.message ?? e) } })))
    }
  }, [etapa, rodada])

  // A mensagem some sozinha para não cobrir o tabuleiro (o jogo não espera por ela)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.tipo === 'certo' ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [msg])

  // Mede a posição dos conectores (para desenhar as linhas)
  useLayoutEffect(() => {
    if (etapa !== 'jogo' && etapa !== 'rodada_completa') return
    const centro = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const img: Record<string, Ponto> = {}
    const cat: Record<string, Ponto> = {}
    document.querySelectorAll<HTMLElement>('[data-conector-imagem]').forEach((el) => (img[el.dataset.conectorImagem!] = centro(el)))
    document.querySelectorAll<HTMLElement>('[data-conector-categoria]').forEach((el) => (cat[el.dataset.conectorCategoria!] = centro(el)))
    setPos({ img, cat })
  }, [etapa, idx, tick, conexoes])
  useEffect(() => {
    // as linhas usam coordenadas da tela: recalcula ao redimensionar ou rolar a página
    const r = () => setTick((t) => t + 1)
    window.addEventListener('resize', r)
    window.addEventListener('scroll', r, { passive: true })
    return () => {
      window.removeEventListener('resize', r)
      window.removeEventListener('scroll', r)
    }
  }, [])

  const conectar = useCallback(
    (imagemId: string, classe: Classe) => {
      if (!rodada) return
      const img = rodada.imagens.find((i) => i.id === imagemId)
      if (!img || conexoes[imagemId]) return
      if (Object.values(conexoes).includes(classe)) {
        setMsg({ tipo: 'info', texto: `“${nomeClasse(classe)}” já tem par. Escolha outra categoria!` })
        return
      }
      // Gabarito = rótulo verdadeiro do manifesto. A CNN não altera o resultado.
      if (img.classe === classe) {
        const novas = { ...conexoes, [imagemId]: classe }
        setConexoes(novas)
        setPontos((p) => p + PONTOS_CONEXAO)
        setAcertos((a) => a + 1)
        som.acerto()
        setMsg({ tipo: 'certo', texto: `Isso! É ${nomeClasse(classe)}.`, imagem: img })
        if (Object.keys(novas).length === rodada.imagens.length) {
          if (errosRodada === 0) {
            setPontos((p) => p + BONUS_RODADA_PERFEITA)
            setRodadasPerfeitas((n) => n + 1)
          }
          setConfete(Date.now())
          setTimeout(() => setEtapa('rodada_completa'), 1600)
        }
      } else {
        setErrosRodada((e) => e + 1)
        setErrosTotal((e) => e + 1)
        setLinhaErrada({ de: imagemId, para: classe })
        setTimeout(() => setLinhaErrada(null), 1200)
        som.erro()
        setMsg({ tipo: 'errado', texto: 'Hmm, essa não combina. Tente outra categoria: você não perde pontos!' })
      }
    },
    [rodada, conexoes, errosRodada],
  )

  const proximaRodada = useCallback(() => {
    if (idx + 1 >= rodadas.length) {
      const todas = rodadas.flatMap((r) => r.imagens)
      const comCnn = todas.filter((i) => cnn[i.id]?.previsao)
      void salvarPontuacao({
        jogo: 'conexao_ecologica',
        pontos,
        acertos,
        erros: errosTotal,
        acertos_cnn: comCnn.filter((i) => cnn[i.id].previsao!.classe_prevista === i.classe).length,
        total_cnn: comCnn.length,
      })
      setEtapa('resultado')
      return
    }
    setIdx((i) => i + 1)
    setConexoes({})
    setErrosRodada(0)
    setMsg(null)
    setEtapa('jogo')
  }, [idx, rodadas, cnn, pontos, acertos, errosTotal])

  /* -------------------------------------------- controle pela mão ----- */
  const jogando = etapa === 'jogo' && !pausado && !semCamera
  const arrastoRef = useRef(arrasto)
  arrastoRef.current = arrasto

  const iniciarArrasto = (x: number, y: number) => {
    const el = alvoSobCursor(x, y, '[data-alvo-imagem]', TOLERANCIA_ENCAIXE)
    const id = el?.dataset.alvoImagem
    if (id && !conexoes[id]) {
      setArrasto(id)
      som.gesto()
    }
  }
  const soltarArrasto = (x: number, y: number) => {
    const origem = arrastoRef.current
    if (!origem) return
    const el = alvoSobCursor(x, y, '[data-alvo-categoria]', TOLERANCIA_ENCAIXE)
    setArrasto(null)
    if (el) conectar(origem, el.dataset.alvoCategoria as Classe)
  }

  const cursor = useCursorMao(jogando, (e) => {
    if (e.tipo === 'mao_perdida' && arrastoRef.current) {
      // Mão saiu da câmera: cancela a ligação, sem penalidade
      setArrasto(null)
      setMsg({ tipo: 'info', texto: '✋ A sua mão saiu da câmera, então a linha foi desfeita. Pode tentar de novo, sem perder pontos.' })
      return
    }
    if (!usarPinca) return
    if (e.tipo === 'pinca_inicio') iniciarArrasto(e.x, e.y)
    if (e.tipo === 'pinca_fim') soltarArrasto(e.x, e.y)
  })

  // Modo alternativo: permanência do cursor sobre o cartão/conector
  const hover = useRef<{ alvo: string | null; desde: number }>({ alvo: null, desde: 0 })
  useEffect(() => {
    if (!jogando || usarPinca || !cursor.visivel) {
      hover.current = { alvo: null, desde: 0 }
      setProgressoPermanencia(0)
      return
    }
    const seletor = arrasto ? '[data-alvo-categoria]' : '[data-alvo-imagem]'
    const el = alvoSobCursor(cursor.x, cursor.y, seletor, TOLERANCIA_ENCAIXE)
    const chave = el ? (el.dataset.alvoCategoria ?? el.dataset.alvoImagem ?? null) : null
    const ocupado = !arrasto && chave && conexoes[chave]
    const agora = performance.now()
    if (!chave || ocupado) {
      hover.current = { alvo: null, desde: 0 }
      setProgressoPermanencia(0)
      return
    }
    if (hover.current.alvo !== chave) hover.current = { alvo: chave, desde: agora }
    const p = (agora - hover.current.desde) / config.tempoPermanenciaMs
    setProgressoPermanencia(p)
    if (p >= 1) {
      hover.current = { alvo: null, desde: agora + 1e9 }
      if (arrasto) soltarArrasto(cursor.x, cursor.y)
      else iniciarArrasto(cursor.x, cursor.y)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.x, cursor.y, cursor.visivel, jogando, usarPinca, arrasto])

  // Mouse/toque/teclado como alternativa: clicar foto e depois categoria
  const cliqueImagem = (id: string) => {
    if (conexoes[id]) return
    setCliqueOrigem(id)
    som.clique()
  }
  const cliqueCategoria = (c: Classe) => {
    if (!cliqueOrigem) return setMsg({ tipo: 'info', texto: 'Primeiro escolha uma foto à esquerda.' })
    conectar(cliqueOrigem, c)
    setCliqueOrigem(null)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && etapa === 'jogo') {
        setPausado((p) => !p)
        setArrasto(null)
      }
      if (e.key === 'Enter' && etapa === 'rodada_completa') proximaRodada()
      if (e.key === 'Enter' && etapa === 'instrucoes') iniciar()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [etapa, proximaRodada, iniciar])

  /* ------------------------------------------------------- telas ------ */
  const camadaAtiva = !semCamera && (etapa === 'instrucoes' || etapa === 'rodada_completa' || etapa === 'resultado' || pausado)

  if (etapa === 'camera') {
    return (
      <AutorizacaoCamera
        oQue="mão"
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
    return <CalibracaoMao aoConcluir={() => setEtapa('instrucoes')} aoVoltar={() => navigate('/jogos')} />
  }

  if (etapa === 'instrucoes') {
    return (
      <div className="tela-centro">
        <CamadaMaoClicavel ativo={camadaAtiva} />
        <div className="cartao cartao-largo">
          <div className="linha-personagem">
            <Arvore tamanho={110} />
            <div>
              <p className="etapa-rotulo">Conexão Ecológica</p>
              <h2>Ligue cada material à sua categoria</h2>
            </div>
          </div>
          {semCamera && <p className="alerta">🖱️ Jogando sem câmera: clique (ou toque) em uma foto e depois na categoria. No teclado, use Tab e Enter.</p>}
          <ol className="passos">
            <li>☝️ Mexa o dedo indicador no ar: a folhinha segue o seu dedo.</li>
            {usarPinca ? (
              <>
                <li>🤏 Em cima de uma foto, junte o polegar e o indicador, como uma pinça.</li>
                <li>➡️ Sem soltar os dedos, leve a linha até a categoria certa.</li>
                <li>🖐️ Abra os dedos para soltar a linha.</li>
              </>
            ) : (
              <>
                <li>⏳ Pare a folhinha em cima de uma foto até o círculo se completar.</li>
                <li>➡️ Leve a linha até a categoria e pare em cima dela do mesmo jeito.</li>
              </>
            )}
            <li>🌳 Cada acerto faz uma árvore crescer! Errou? É só tentar de novo, sem perder pontos.</li>
          </ol>
          {erroImagens && <p className="alerta">Não consegui carregar as fotos ({erroImagens}). Confira se o servidor do jogo está ligado.</p>}
          <p className="nota">
            Para começar, {usarPinca ? 'faça a pinça' : 'pare a folhinha'} em cima do botão “Começar!”. Também dá para usar o mouse ou o Enter.
          </p>
          <div className="linha-botoes">
            <Botao cor="branco" onClick={() => setEtapa('calibracao')}>
              Ajustar de novo
            </Botao>
            <Botao grande onClick={iniciar} disabled={!imagens?.length}>
              Começar!
            </Botao>
          </div>
        </div>
      </div>
    )
  }

  if (etapa === 'resultado') {
    const todas = rodadas.flatMap((r) => r.imagens)
    const comCnn = todas.filter((i) => cnn[i.id]?.previsao)
    return (
      <>
        <CamadaMaoClicavel ativo={!semCamera} />
        <TelaResultado
          titulo="Conexão Ecológica"
          resumo={{
            pontos,
            maximo: RODADAS * (4 * PONTOS_CONEXAO + BONUS_RODADA_PERFEITA),
            acertos,
            erros: errosTotal,
            acertosCnn: comCnn.filter((i) => cnn[i.id].previsao!.classe_prevista === i.classe).length,
            totalCnn: comCnn.length,
            tempoMedioCnnMs: comCnn.length
              ? comCnn.reduce((s, i) => s + cnn[i.id].previsao!.tempo_inferencia_ms, 0) / comCnn.length
              : undefined,
          }}
          dica={<p className="nota">Rodadas sem nenhum erro: {rodadasPerfeitas} de {RODADAS}.</p>}
          acoes={
            <>
              <Botao cor="branco" onClick={() => navigate('/jogos')}>
                Menu
              </Botao>
              <Botao grande onClick={iniciar}>
                Jogar de novo
              </Botao>
            </>
          }
        />
      </>
    )
  }

  if (!rodada) return null
  const arrastoOrigem = arrasto ? pos.img[arrasto] : null
  const ultimaImgMsg = msg?.imagem
  const edu = ultimaImgMsg ? textoEducativo(ultimaImgMsg.classe) : null

  return (
    <div className="tela-jogo">
      <Confetes disparo={confete} />
      <CamadaMaoClicavel ativo={camadaAtiva} />
      <header className="hud">
        <span className="hud-titulo">Conexão Ecológica</span>
        <BarraProgresso atual={idx} total={rodadas.length} />
        <span className="hud-pontos">⭐ {pontos}</span>
        <span className="hud-nivel">Nível {rodada.nivel + 1}</span>
        <span className={`hud-camera ${cursor.visivel ? 'ok' : ''}`} title="Estou vendo a sua mão">
          {semCamera ? '🖱️' : cursor.visivel ? '✋' : '❔'}
        </span>
        <Botao cor="branco" onClick={() => setPausado(true)}>
          ⏸ Pausa
        </Botao>
      </header>

      <main className="conexao">
        <div className="coluna">
          {rodada.imagens.map((img) => (
            <div
              key={img.id}
              className={`cartao-foto ${conexoes[img.id] ? 'conectado' : ''} ${arrasto === img.id || cliqueOrigem === img.id ? 'ativo' : ''}`}
              data-alvo-imagem={img.id}
              onClick={() => cliqueImagem(img.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && cliqueImagem(img.id)}
              aria-label="Foto de um material"
            >
              <img src={img.url} alt="Foto de um material" />
              <span className="conector conector-dir" data-conector-imagem={img.id} />
            </div>
          ))}
        </div>

        <div className="coluna-meio">
          <Muda crescimento={Object.keys(conexoes).length / 4} tamanho={90} />
          {semCamera ? (
            <p className="nota">🖱️ Jogando sem câmera: clique em uma foto e depois na categoria.</p>
          ) : (
          <div className="status-gesto">
            <PreviaCamera compacta detectado={cursor.visivel} />
            <AvisosCamera ausente={cursor.maoAusente} oQue="mão" />
            {usarPinca && <p className="nota">{cursor.pincando ? '🤏 Dedos juntos' : '🖐️ Mão aberta'}</p>}
          </div>
          )}
        </div>

        <div className="coluna">
          {rodada.categorias.map((c) => {
            const usada = Object.values(conexoes).includes(c)
            return (
              <div
                key={c}
                className={`cartao-categoria ${usada ? 'conectado' : ''}`}
                style={{ background: CATEGORIAS[c].cor }}
                data-alvo-categoria={c}
                onClick={() => cliqueCategoria(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && cliqueCategoria(c)}
              >
                <span className="conector conector-esq" data-conector-categoria={c} />
                <span className="alt-emoji" aria-hidden>
                  {CATEGORIAS[c].emoji}
                </span>
                <span className="alt-nome">{nomeClasse(c)}</span>
              </div>
            )
          })}
        </div>
      </main>

      {/* Linhas: fixas (corretas), em andamento e errada (pisca em vermelho) */}
      <svg className="camada-linhas" aria-hidden>
        {Object.entries(conexoes).map(([id, c]) =>
          pos.img[id] && pos.cat[c] ? (
            <line key={id} className="linha-certa" x1={pos.img[id].x} y1={pos.img[id].y} x2={pos.cat[c].x} y2={pos.cat[c].y} />
          ) : null,
        )}
        {linhaErrada && pos.img[linhaErrada.de] && pos.cat[linhaErrada.para] && (
          <line
            className="linha-errada"
            x1={pos.img[linhaErrada.de].x}
            y1={pos.img[linhaErrada.de].y}
            x2={pos.cat[linhaErrada.para].x}
            y2={pos.cat[linhaErrada.para].y}
          />
        )}
        {arrastoOrigem && <line className="linha-arrasto" x1={arrastoOrigem.x} y1={arrastoOrigem.y} x2={cursor.x} y2={cursor.y} />}
      </svg>

      {msg && (
        <div className={`mensagem-conexao msg-${msg.tipo}`} role="status">
          <p>
            <strong>{msg.texto}</strong>
          </p>
          {msg.tipo === 'certo' && ultimaImgMsg && (
            <>
              {edu && <p>♻️ {edu.destino}</p>}
              <PainelCNN
                previsao={cnn[ultimaImgMsg.id]?.previsao}
                erro={cnn[ultimaImgMsg.id]?.erro}
                classeVerdadeira={ultimaImgMsg.classe}
              />
            </>
          )}
        </div>
      )}

      <div className="faixa-ambiente" aria-label={`Ambiente recuperado: ${acertos} de ${totalConexoes}`}>
        {Array.from({ length: totalConexoes }, (_, i) => (
          <Muda key={i} crescimento={i < acertos ? 1 : 0} tamanho={40} />
        ))}
      </div>

      {jogando && <CursorIlustrado c={cursor} progresso={progressoPermanencia} />}
      {jogando && !cursor.visivel && cursor.rastreador === 'carregando' && <p className="carregando">Carregando… (só demora na primeira vez)</p>}

      {etapa === 'rodada_completa' && (
        <div className="feedback-overlay">
          <div className="cartao feedback feedback-certo">
            <div className="linha-personagem">
              <Arvore tamanho={100} humor="animado" />
              <div>
                <h2>Rodada {idx + 1} completa! 🌳</h2>
                <p className="texto-grande">
                  {errosRodada === 0 ? `Nenhum erro! Você ganhou ${BONUS_RODADA_PERFEITA} pontos de bônus! 🌟` : 'Muito bem! A floresta está crescendo.'}
                </p>
              </div>
            </div>
            <div className="resumo-cnn">
              {rodada.imagens.map((img) => {
                const p = cnn[img.id]?.previsao
                return (
                  <div key={img.id} className="resumo-cnn-item">
                    <img src={img.url} alt="" />
                    <span>✔ {nomeClasse(img.classe)}</span>
                    <span className={p ? (p.classe_prevista === img.classe ? 'ok' : 'nok') : ''}>
                      🤖 {p ? `${nomeClasse(p.classe_prevista)} (${(p.confianca * 100).toFixed(0)}%)` : '…'}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="nota">Para continuar, {usarPinca ? 'faça a pinça' : 'pare a folhinha'} em cima do botão (ou aperte Enter).</p>
            <div className="linha-botoes">
              <Botao grande onClick={proximaRodada}>
                {idx + 1 >= rodadas.length ? 'Ver resultado' : 'Próxima rodada →'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {pausado && (
        <div className="feedback-overlay">
          <div className="cartao feedback">
            <div className="linha-personagem">
              <Robo tamanho={90} />
              <div>
                <h2>Jogo pausado</h2>
                <p className="texto-grande">Escolha com a folhinha, o mouse ou a tecla Esc.</p>
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
