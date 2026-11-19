import { useEffect, useMemo, useRef, useState } from 'react'
import { AvisosCamera, PreviaCamera } from '../../components/Camera'
import { Gotinha } from '../../components/Personagens'
import { AnelProgresso, Botao } from '../../components/UI'
import { useCamera } from '../../context/CameraContext'
import { useConfig } from '../../context/ConfigContext'
import { som } from '../../services/som'
import {
  DetectorCabeca,
  DetectorPiscadas,
  descreverComando,
  DIRECOES_CABECA,
  montarCalibracaoCabeca,
  montarCalibracaoOlhos,
  opcaoDoComando,
  type AmostraOlhos,
  type CalibracaoCabeca,
  type CalibracaoOlhos,
  DetectorConfirmacao,
  type GestoConfirmacao,
} from '../../vision/blinkDetection'
import { TEXTO_CONFIRMAR } from '../../vision/useControleFacial'
import { useRastreamentoFacial, type QuadroFace } from '../../vision/faceTracking'

type Etapa = 'rosto' | 'abertos' | 'esquerdo' | 'direito' | 'neutro' | 'boca' | 'teste' | 'confirmar' | 'pronto'

const LETRAS = ['A', 'B', 'C', 'D']
const QUADROS_ABERTOS = 40
const QUADROS_FECHADO = 18
const QUADROS_NEUTRO = 40

/**
 * Calibração individual. Mede os olhos (ou a posição da cabeça/boca) da
 * criança e cria limiares adaptativos; depois faz um teste guiado com os 4 gestos.
 */
export function CalibracaoFacial({ aoConcluir, aoVoltar }: { aoConcluir: () => void; aoVoltar: () => void }) {
  const { video } = useCamera()
  const { config, alterar, setCalibracoes } = useConfig()
  const modo = config.controleFacial
  const [etapa, setEtapa] = useState<Etapa>('rosto')
  const [progresso, setProgresso] = useState(0)
  const [rosto, setRosto] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [testeIdx, setTesteIdx] = useState(0)
  const [ultimoGesto, setUltimoGesto] = useState<string | null>(null)
  const [cal, setCal] = useState<CalibracaoOlhos | null>(null)
  const [calCabeca, setCalCabeca] = useState<CalibracaoCabeca | null>(null)
  const [vivo, setVivo] = useState<{ a: number; b: number; pend?: number; quad?: number | null; prog?: number }>({ a: 0, b: 0 })

  const buf = useRef({ abertos: [] as AmostraOlhos[], esq: [] as AmostraOlhos[], dir: [] as AmostraOlhos[], neutro: [] as QuadroFace[], boca: [] as QuadroFace[], rostoDesde: 0 })

  // Reinicia ao trocar de modo (ex.: "não consigo piscar um olho só")
  useEffect(() => {
    buf.current = { abertos: [], esq: [], dir: [], neutro: [], boca: [], rostoDesde: 0 }
    setEtapa('rosto')
    setProgresso(0)
    setMsg(null)
    setTesteIdx(0)
  }, [modo])

  const detector = useMemo(
    () =>
      cal
        ? new DetectorPiscadas(cal, {
            janelaDuplaMs: config.janelaDuplaMs,
            cooldownMs: config.cooldownMs,
            preparoMs: config.preparoMs,
            duracaoMinMs: config.duracaoMinPiscadaMs,
          })
        : null,
    [cal, config.janelaDuplaMs, config.cooldownMs, config.preparoMs, config.duracaoMinPiscadaMs],
  )
  // Gesto de confirmação (no modo "boca" a confirmação é com os olhos)
  const gestoConf: GestoConfirmacao = modo === 'boca' ? 'olhos' : config.gestoConfirmacao
  const detConfirmar = useMemo(
    () => new DetectorConfirmacao(gestoConf, config.duracaoConfirmacaoMs, cal ?? undefined, calCabeca ?? undefined),
    [gestoConf, config.duracaoConfirmacaoMs, cal, calCabeca],
  )
  const [progConfirmar, setProgConfirmar] = useState(0)

  const detCabeca = useMemo(
    () => (calCabeca && modo !== 'piscadas' ? new DetectorCabeca(calCabeca, modo, config.tempoPermanenciaMs, config.sensibilidadeCabeca) : null),
    [calCabeca, modo, config.tempoPermanenciaMs, config.sensibilidadeCabeca],
  )

  const avancar = (proxima: Etapa) => {
    som.gesto()
    setProgresso(0)
    setEtapa(proxima)
  }

  const finalizarOlhos = () => {
    const b = buf.current
    const c = montarCalibracaoOlhos(b.abertos, b.esq, b.dir)
    if (!c) {
      setMsg('Hmm, não consegui diferenciar os dois olhos. Vamos tentar de novo, devagar!')
      b.esq = []
      b.dir = []
      avancar('esquerdo')
      return
    }
    setMsg(null)
    setCal(c)
    avancar('teste')
  }

  const finalizarCabeca = () => {
    const c = montarCalibracaoCabeca(buf.current.neutro, buf.current.boca)
    if (!c) return avancar('neutro')
    setCalCabeca(c)
    avancar('teste')
  }

  const estadoRastreador = useRastreamentoFacial(video, etapa !== 'pronto', (q) => {
    setRosto(q.detectado)
    const b = buf.current
    if (!q.detectado) {
      b.rostoDesde = 0
      return
    }
    b.rostoDesde ||= q.t
    setVivo((v) => ({ ...v, a: q.canalA, b: q.canalB }))
    const base = b.abertos.length
      ? { a: b.abertos.reduce((s, x) => s + x.a, 0) / base0(b.abertos), b: b.abertos.reduce((s, x) => s + x.b, 0) / base0(b.abertos) }
      : { a: 0, b: 0 }

    switch (etapa) {
      case 'rosto':
        setProgresso(Math.min(1, (q.t - b.rostoDesde) / 1000))
        if (q.t - b.rostoDesde > 1000) avancar(modo === 'piscadas' ? 'abertos' : 'neutro')
        break
      case 'abertos':
        // descarta quadros com piscada natural
        if (q.canalA < 0.5 && q.canalB < 0.5) b.abertos.push({ a: q.canalA, b: q.canalB })
        setProgresso(b.abertos.length / QUADROS_ABERTOS)
        if (b.abertos.length >= QUADROS_ABERTOS) avancar('esquerdo')
        break
      case 'esquerdo':
      case 'direito': {
        const subidaA = q.canalA - base.a
        const subidaB = q.canalB - base.b
        const alvo = etapa === 'esquerdo' ? b.esq : b.dir
        // Um olho bem fechado e o outro claramente menos fechado
        if (Math.max(subidaA, subidaB) > 0.25 && Math.abs(subidaA - subidaB) > 0.12) alvo.push({ a: q.canalA, b: q.canalB })
        setProgresso(alvo.length / QUADROS_FECHADO)
        if (alvo.length >= QUADROS_FECHADO) {
          if (etapa === 'esquerdo') avancar('direito')
          else finalizarOlhos()
        }
        break
      }
      case 'neutro':
        b.neutro.push(q)
        setProgresso(b.neutro.length / QUADROS_NEUTRO)
        if (b.neutro.length >= QUADROS_NEUTRO) {
          if (modo === 'boca') avancar('boca')
          else finalizarCabeca()
        }
        break
      case 'boca': {
        const boca0 = b.neutro.reduce((s, x) => s + x.boca, 0) / b.neutro.length
        if (q.boca > boca0 + 0.2) b.boca.push(q)
        setProgresso(b.boca.length / 12)
        if (b.boca.length >= 12) finalizarCabeca()
        break
      }
      case 'teste': {
        if (modo === 'piscadas' && detector) {
          const s = detector.atualizar(q)
          setVivo((v) => ({ ...v, pend: s.pendente?.fracao }))
          if (s.comando) {
            const op = opcaoDoComando(s.comando)
            setUltimoGesto(descreverComando(s.comando))
            if (op === testeIdx) {
              som.acerto()
              if (testeIdx === 3) avancar('confirmar')
              else setTesteIdx(testeIdx + 1)
            } else som.erro()
          }
        } else if (detCabeca) {
          const s = detCabeca.atualizar(q)
          setVivo((v) => ({ ...v, quad: s.quadrante, prog: s.progresso }))
          if (s.comando !== undefined) {
            setUltimoGesto(DIRECOES_CABECA[s.comando])
            if (s.comando === testeIdx) {
              som.acerto()
              if (testeIdx === 3) avancar('confirmar')
              else setTesteIdx(testeIdx + 1)
            } else som.erro()
          }
        }
        break
      }
      case 'confirmar': {
        const c = detConfirmar.atualizar(q)
        setProgConfirmar(c.progresso)
        if (c.confirmou) {
          som.acerto()
          avancar('pronto')
        }
        break
      }
    }
  })

  // Salva a calibração (só na memória da sessão)
  useEffect(() => {
    if (etapa === 'pronto') {
      if (modo === 'piscadas' && cal) setCalibracoes({ olhos: cal })
      if (modo !== 'piscadas' && calCabeca) setCalibracoes({ cabeca: calCabeca })
    }
  }, [etapa, modo, cal, calCabeca, setCalibracoes])

  const pularTeste = () => avancar('pronto')

  // Segue sozinho para as instruções (sem precisar de mouse). Se a
  // confiabilidade ficou baixa, dá mais tempo para ler o aviso.
  useEffect(() => {
    if (etapa !== 'pronto') return
    const t = setTimeout(aoConcluir, cal?.confiabilidade === 'baixa' && modo === 'piscadas' ? 7000 : 2500)
    return () => clearTimeout(t)
  }, [etapa, cal, modo, aoConcluir])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && etapa === 'pronto') aoConcluir()
      if (e.key === 'Escape') aoVoltar()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [etapa, aoConcluir, aoVoltar])

  const passos: Record<Etapa, { titulo: string; texto: string }> = {
    rosto: { titulo: 'Olá! Cadê você?', texto: 'Fique de frente para a câmera, com o rosto bem iluminado.' },
    abertos: { titulo: 'Olhos abertos', texto: 'Olhe para a tela com os dois olhos abertos, com calma.' },
    esquerdo: { titulo: 'Feche só o olho ESQUERDO', texto: 'Feche o olho do lado esquerdo da tela e segure um pouquinho.' },
    direito: { titulo: 'Agora só o olho DIREITO', texto: 'Feche o olho do lado direito da tela e segure um pouquinho.' },
    neutro: { titulo: 'Cabeça no centro', texto: 'Olhe reto para a tela, sem mexer a cabeça.' },
    boca: { titulo: 'Abra bem a boca!', texto: 'Abra a boca como se fosse dizer “Ahhh”.' },
    teste: {
      titulo: `Vamos treinar: alternativa ${LETRAS[testeIdx]}`,
      texto:
        modo === 'piscadas'
          ? ['Pisque uma vez o olho esquerdo', 'Pisque uma vez o olho direito', 'Pisque duas vezes o olho esquerdo', 'Pisque duas vezes o olho direito'][testeIdx]
          : `Aponte a cabeça para ${DIRECOES_CABECA[testeIdx]}${modo === 'boca' ? ' e abra a boca' : ' e segure'}`,
    },
    confirmar: {
      titulo: 'Agora, o gesto de confirmar',
      texto: `No jogo, a piscada só marca a resposta. Para confirmar, ${TEXTO_CONFIRMAR[gestoConf]}. Experimente agora!`,
    },
    pronto: { titulo: 'Tudo pronto! 🎉', texto: 'Já entendi os seus gestos. Vamos jogar!' },
  }

  return (
    <div className="tela-calibracao">
      <div className="calibracao-camera">
        <PreviaCamera detectado={rosto} />
        <AvisosCamera ausente={!rosto} oQue="rosto" />
        {modo === 'piscadas' && etapa !== 'rosto' && (
          <div className="medidores" aria-hidden>
            <Medidor rotulo="canal 1" v={vivo.a} />
            <Medidor rotulo="canal 2" v={vivo.b} />
          </div>
        )}
      </div>
      <div className="cartao calibracao-passo">
        <div className="linha-personagem">
          <Gotinha tamanho={84} humor={etapa === 'pronto' ? 'animado' : 'feliz'} />
          <div>
            <p className="etapa-rotulo">Ajustando o jogo {modo === 'piscadas' ? 'aos seus olhos' : 'aos seus movimentos'}</p>
            <h2>{passos[etapa].titulo}</h2>
            <p className="texto-grande">{passos[etapa].texto}</p>
          </div>
        </div>
        {estadoRastreador === 'carregando' && <p className="nota">⏳ Carregando… (só demora na primeira vez)</p>}
        {estadoRastreador === 'erro' && <p className="alerta">Não consegui ligar o reconhecimento do rosto neste navegador.</p>}
        {msg && <p className="alerta">{msg}</p>}

        {etapa === 'confirmar' && (
          <div className="teste-gestos">
            <AnelProgresso fracao={progConfirmar} tamanho={80} />
            <p className="texto-grande">{progConfirmar > 0 ? 'Isso! Continue assim…' : 'Estou esperando…'}</p>
          </div>
        )}

        {etapa !== 'teste' && etapa !== 'confirmar' && etapa !== 'pronto' && (
          <div className="barra-calibracao">
            <i style={{ width: `${Math.min(1, progresso) * 100}%` }} />
          </div>
        )}

        {etapa === 'teste' && (
          <div className="teste-gestos">
            {LETRAS.map((l, i) => (
              <span key={l} className={`teste-letra ${i < testeIdx ? 'ok' : i === testeIdx ? 'atual' : ''}`}>
                {i < testeIdx ? '✓' : l}
              </span>
            ))}
            {vivo.pend !== undefined && modo === 'piscadas' && (
              <span className="teste-janela">
                <AnelProgresso fracao={vivo.pend} tamanho={36} cor="#ff9800" /> esperando 2ª piscada…
              </span>
            )}
            {modo !== 'piscadas' && vivo.quad != null && (
              <span className="teste-janela">
                <AnelProgresso fracao={vivo.prog ?? 0} tamanho={36} /> apontando {LETRAS[vivo.quad]}
              </span>
            )}
            {ultimoGesto && <p className="nota">Último gesto reconhecido: {ultimoGesto}</p>}
          </div>
        )}

        {etapa === 'pronto' && cal?.confiabilidade === 'baixa' && modo === 'piscadas' && (
          <p className="alerta">
            Não consegui enxergar os seus olhos tão bem ({cal.motivos.join('; ')}). Se o jogo marcar a alternativa errada, é só piscar
            de novo antes de confirmar. Nas Configurações dá para deixar a piscada mais “exigente”.
          </p>
        )}

        <div className="linha-botoes">
          <Botao cor="branco" onClick={aoVoltar}>
            ← Voltar
          </Botao>
          {modo === 'piscadas' && etapa !== 'pronto' && (
            <Botao cor="amarelo" onClick={() => alterar({ controleFacial: 'cabeca' })}>
              Não consigo piscar um olho só
            </Botao>
          )}
          {(etapa === 'teste' || etapa === 'confirmar') && (
            <Botao cor="azul" onClick={pularTeste}>
              Pular treino
            </Botao>
          )}
          {etapa === 'pronto' && (
            <Botao grande onClick={aoConcluir} autoFocus>
              Continuar →
            </Botao>
          )}
        </div>
      </div>
    </div>
  )
}

const base0 = (v: unknown[]) => Math.max(1, v.length)

function Medidor({ rotulo, v }: { rotulo: string; v: number }) {
  return (
    <div className="medidor">
      <span>{rotulo}</span>
      <i style={{ height: `${Math.min(1, v) * 100}%` }} />
    </div>
  )
}
