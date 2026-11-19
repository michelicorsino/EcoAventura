import { useEffect, useRef, useState } from 'react'
import { AvisosCamera, PreviaCamera } from '../../components/Camera'
import { CursorIlustrado } from '../../components/CursorMao'
import { Arvore } from '../../components/Personagens'
import { AnelProgresso, Botao } from '../../components/UI'
import { useCamera } from '../../context/CameraContext'
import { useConfig } from '../../context/ConfigContext'
import { som } from '../../services/som'
import { useRastreamentoMao } from '../../vision/handTracking'
import { montarCalibracaoPinca } from '../../vision/pinchDetection'
import { alvoSobCursor, useCursorMao } from '../../vision/useCursorMao'

type Etapa = 'mao' | 'aberta' | 'pinca' | 'teste' | 'pronto'
const QUADROS = 30

/** Calibração da mão: tamanho da pinça individual + teste guiado com o cursor. */
export function CalibracaoMao({ aoConcluir, aoVoltar }: { aoConcluir: () => void; aoVoltar: () => void }) {
  const { video } = useCamera()
  const { config, alterar, setCalibracoes } = useConfig()
  const usarPinca = config.controleMao === 'pinca'
  const [etapa, setEtapa] = useState<Etapa>('mao')
  const [progresso, setProgresso] = useState(0)
  const [maoVista, setMaoVista] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [acertosTeste, setAcertosTeste] = useState(0)
  const [progressoAlvo, setProgressoAlvo] = useState(0)
  const buf = useRef({ abertas: [] as number[], fechadas: [] as number[], desde: 0 })
  const hover = useRef(0)

  useEffect(() => {
    buf.current = { abertas: [], fechadas: [], desde: 0 }
    setEtapa('mao')
  }, [config.controleMao])

  const avancar = (e: Etapa) => {
    som.gesto()
    setProgresso(0)
    setEtapa(e)
  }

  const estadoRastreador = useRastreamentoMao(video, etapa === 'mao' || etapa === 'aberta' || etapa === 'pinca', (q) => {
    setMaoVista(q.detectado)
    const b = buf.current
    if (!q.detectado) {
      b.desde = 0
      return
    }
    b.desde ||= q.t
    if (etapa === 'mao') {
      setProgresso((q.t - b.desde) / 1000)
      if (q.t - b.desde > 1000) avancar('aberta')
    } else if (etapa === 'aberta') {
      if (q.razaoPinca > 0.45) b.abertas.push(q.razaoPinca)
      setProgresso(b.abertas.length / QUADROS)
      if (b.abertas.length >= QUADROS) {
        if (usarPinca) avancar('pinca')
        else {
          setCalibracoes({ pinca: undefined })
          avancar('teste')
        }
      }
    } else if (etapa === 'pinca') {
      const aberta = [...b.abertas].sort((x, y) => x - y)[Math.floor(b.abertas.length / 2)]
      if (q.razaoPinca < aberta * 0.55) b.fechadas.push(q.razaoPinca)
      setProgresso(b.fechadas.length / QUADROS)
      if (b.fechadas.length >= QUADROS) {
        const cal = montarCalibracaoPinca(b.abertas, b.fechadas)
        if (!cal) {
          setMsg('Não consegui ver a pinça direitinho. Vamos tentar de novo!')
          b.fechadas = []
          setProgresso(0)
          return
        }
        setMsg(null)
        setCalibracoes({ pinca: cal })
        avancar('teste')
      }
    }
  })

  // Teste: levar o cursor até a estrela e "pegar" (pinça) ou segurar em cima.
  const cursor = useCursorMao(etapa === 'teste', (e) => {
    if (usarPinca && e.tipo === 'pinca_inicio' && alvoSobCursor(e.x, e.y, '[data-alvo-teste]', 30)) acertou()
  })
  const acertou = () => {
    som.acerto()
    hover.current = 0
    setProgressoAlvo(0)
    if (acertosTeste + 1 >= 3) avancar('pronto')
    else setAcertosTeste((n) => n + 1)
  }
  useEffect(() => {
    if (etapa !== 'teste') return
    const sobre = cursor.visivel && alvoSobCursor(cursor.x, cursor.y, '[data-alvo-teste]', 30)
    if (!sobre) {
      hover.current = 0
      setProgressoAlvo(0)
      return
    }
    if (usarPinca) return
    const agora = performance.now()
    hover.current ||= agora
    const p = (agora - hover.current) / config.tempoPermanenciaMs
    setProgressoAlvo(p)
    if (p >= 1) acertou()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.x, cursor.y, cursor.visivel, etapa])

  useEffect(() => {
    if (etapa !== 'pronto') return
    const t = setTimeout(aoConcluir, 2500)
    return () => clearTimeout(t)
  }, [etapa, aoConcluir])

  const posAlvo = [
    { left: '20%', top: '30%' },
    { left: '75%', top: '35%' },
    { left: '50%', top: '70%' },
  ][acertosTeste]

  const textos: Record<Etapa, [string, string]> = {
    mao: ['Mostre a sua mão', 'Levante a mão aberta na frente da câmera.'],
    aberta: ['Mão aberta', 'Deixe os dedos bem abertos, como quem dá “oi”.'],
    pinca: ['Agora, faça uma pinça', 'Encoste a ponta do polegar na ponta do indicador e segure assim.'],
    teste: [
      `Pegue a estrela ${acertosTeste + 1} de 3`,
      usarPinca ? 'Leve a folhinha até a estrela e faça a pinça.' : 'Leve a folhinha até a estrela e espere o círculo encher.',
    ],
    pronto: ['Tudo certo! 🎉', 'Você já sabe mexer a folhinha. Vamos jogar!'],
  }

  return (
    <div className="tela-calibracao">
      <div className="calibracao-camera">
        <PreviaCamera detectado={etapa === 'teste' ? cursor.visivel : maoVista} />
        <AvisosCamera ausente={etapa === 'teste' ? cursor.maoAusente : !maoVista} oQue="mão" />
      </div>
      <div className="cartao calibracao-passo">
        <div className="linha-personagem">
          <Arvore tamanho={90} humor={etapa === 'pronto' ? 'animado' : 'feliz'} />
          <div>
            <p className="etapa-rotulo">Ajustando o jogo à sua mão</p>
            <h2>{textos[etapa][0]}</h2>
            <p className="texto-grande">{textos[etapa][1]}</p>
          </div>
        </div>
        {estadoRastreador === 'carregando' && <p className="nota">⏳ Carregando… (só demora na primeira vez)</p>}
        {estadoRastreador === 'erro' && <p className="alerta">Não consegui ligar o reconhecimento da mão neste navegador.</p>}
        {msg && <p className="alerta">{msg}</p>}
        {etapa !== 'teste' && etapa !== 'pronto' && (
          <div className="barra-calibracao">
            <i style={{ width: `${Math.min(1, progresso) * 100}%` }} />
          </div>
        )}
        <div className="linha-botoes">
          <Botao cor="branco" onClick={aoVoltar}>
            ← Voltar
          </Botao>
          {usarPinca && etapa !== 'pronto' && (
            <Botao cor="amarelo" onClick={() => alterar({ controleMao: 'permanencia' })}>
              A pinça está difícil? Use “parar em cima”
            </Botao>
          )}
          {etapa === 'teste' && (
            <Botao cor="azul" onClick={() => avancar('pronto')}>
              Pular treino
            </Botao>
          )}
          {etapa === 'pronto' && <Botao onClick={aoConcluir}>Continuar →</Botao>}
        </div>
      </div>
      {etapa === 'teste' && (
        <>
          <div className="alvo-teste" data-alvo-teste="" style={posAlvo}>
            ⭐{progressoAlvo > 0 && <AnelProgresso fracao={progressoAlvo} tamanho={80} cor="#ff9800" />}
          </div>
          <CursorIlustrado c={cursor} />
        </>
      )}
    </div>
  )
}
