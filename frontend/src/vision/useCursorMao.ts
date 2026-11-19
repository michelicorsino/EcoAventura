import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../context/CameraContext'
import { useConfig } from '../context/ConfigContext'
import { cameraParaTela, useRastreamentoMao, type QuadroMao } from './handTracking'
import { DetectorPinca, PINCA_PADRAO } from './pinchDetection'
import { Suavizador2D } from './suavizacao'

export interface EventoCursor {
  tipo: 'pinca_inicio' | 'pinca_fim' | 'mao_perdida' | 'mao_voltou'
  x: number
  y: number
}

export interface EstadoCursor {
  rastreador: 'carregando' | 'pronto' | 'erro'
  visivel: boolean
  /** Mão sumiu há mais de 0,4 s. */
  maoAusente: boolean
  x: number
  y: number
  pincando: boolean
  nivelPinca: number
}

/**
 * Cursor controlado pela ponta do indicador (landmark 8), com suavização
 * One Euro, conversão câmera→tela e detecção de pinça.
 * `aoEvento` recebe início/fim da pinça e perda/volta da mão.
 */
export function useCursorMao(ativo: boolean, aoEvento?: (e: EventoCursor, estado: EstadoCursor) => void) {
  const { video } = useCamera()
  const { config, calibracoes } = useConfig()
  const cb = useRef(aoEvento)
  cb.current = aoEvento
  const suav = useMemo(() => new Suavizador2D(config.suavizacaoCursor), [config.suavizacaoCursor])
  const pinca = useMemo(() => new DetectorPinca(calibracoes.pinca ?? PINCA_PADRAO), [calibracoes.pinca])
  // Guarda as últimas posições: na hora da pinça usamos a posição de ~120 ms
  // antes, porque fechar os dedos puxa o indicador um pouco para baixo.
  const historico = useRef<{ t: number; x: number; y: number }[]>([])
  const ultimoVisto = useRef(0)
  const perdida = useRef(true)
  const pos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const ultimaPinca = useRef({ pincando: false, nivel: 0 })
  const assinatura = useRef('')

  const [estado, setEstado] = useState<EstadoCursor>({
    rastreador: 'carregando',
    visivel: false,
    maoAusente: true,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    pincando: false,
    nivelPinca: 0,
  })

  useEffect(() => {
    if (!ativo) {
      pinca.reiniciar()
      suav.reset()
    }
  }, [ativo, pinca, suav])

  const rastreador = useRastreamentoMao(
    video,
    ativo,
    (q: QuadroMao) => {
    const emitir = (tipo: EventoCursor['tipo'], x: number, y: number, e: EstadoCursor) => cb.current?.({ tipo, x, y }, e)
    let { x, y } = pos.current
    if (q.detectado) {
      const tela = cameraParaTela(q.indicador.x, q.indicador.y)
      const s = suav.filtrar(tela.x, tela.y, q.t)
      x = s.x
      y = s.y
      pos.current = { x, y }
      ultimoVisto.current = q.t
      historico.current.push({ t: q.t, x, y })
      while (historico.current.length && q.t - historico.current[0].t > 400) historico.current.shift()
    }
    const ausente = !q.detectado && q.t - ultimoVisto.current > 400
    // Toleramos alguns quadros sem mão antes de considerar perdida. Nesses
    // quadros a pinça fica como estava (antes, a falha momentânea do rastreio
    // contava como "dedos abertos" e soltava a linha no lugar errado).
    const p =
      q.detectado || ausente
        ? pinca.atualizar(q.razaoPinca, q.detectado)
        : { ...ultimaPinca.current, inicio: false, fim: false }
    ultimaPinca.current = { pincando: p.pincando, nivel: p.nivel }
    const novo: EstadoCursor = {
      rastreador: 'pronto',
      visivel: q.detectado || !ausente,
      maoAusente: ausente,
      x,
      y,
      pincando: p.pincando,
      nivelPinca: p.nivel,
    }
    // Re-renderiza só quando o cursor andou ≥ 1 px ou o estado mudou.
    const chave = `${Math.round(x)}|${Math.round(y)}|${novo.visivel}|${ausente}|${p.pincando}|${Math.round(p.nivel * 10)}`
    if (chave !== assinatura.current) {
      assinatura.current = chave
      setEstado(novo)
    }

    if (ausente && !perdida.current) {
      perdida.current = true
      suav.reset()
      emitir('mao_perdida', x, y, novo)
    } else if (q.detectado && perdida.current) {
      perdida.current = false
      emitir('mao_voltou', x, y, novo)
    }
    if (p.inicio) {
      const alvo = historico.current.find((h) => q.t - h.t <= 120) ?? { x, y }
      emitir('pinca_inicio', alvo.x, alvo.y, novo)
    }
    if (p.fim && !ausente) emitir('pinca_fim', x, y, novo)
    },
    config.fpsVisao + 4, // o cursor precisa de um pouco mais de fluidez que os olhos
  )

  return { ...estado, rastreador, usarPinca: config.controleMao === 'pinca' }
}

/** Retorna o elemento sob o cursor que tenha o atributo informado, com tolerância (px). */
export function alvoSobCursor(x: number, y: number, seletor: string, tolerancia = 24): HTMLElement | null {
  let melhor: HTMLElement | null = null
  let melhorDist = Infinity
  document.querySelectorAll<HTMLElement>(seletor).forEach((el) => {
    const r = el.getBoundingClientRect()
    const dx = Math.max(r.left - x, 0, x - r.right)
    const dy = Math.max(r.top - y, 0, y - r.bottom)
    const d = Math.hypot(dx, dy)
    if (d <= tolerancia && d < melhorDist) {
      melhor = el
      melhorDist = d
    }
  })
  return melhor
}
