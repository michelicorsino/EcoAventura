import { useEffect, useRef, useState } from 'react'
import { useConfig } from '../context/ConfigContext'
import { alvoSobCursor, useCursorMao, type EstadoCursor } from '../vision/useCursorMao'
import { AnelProgresso } from './UI'

/** Cursor ilustrado (uma folhinha) na ponta do dedo indicador. */
export function CursorIlustrado({ c, progresso = 0 }: { c: Pick<EstadoCursor, 'x' | 'y' | 'visivel' | 'pincando' | 'nivelPinca'>; progresso?: number }) {
  if (!c.visivel) return null
  return (
    <div className={`cursor-mao ${c.pincando ? 'pincando' : ''}`} style={{ transform: `translate(${c.x}px, ${c.y}px)` }} aria-hidden>
      {progresso > 0 && (
        <div className="cursor-anel">
          <AnelProgresso fracao={progresso} tamanho={64} cor="#ff9800" />
        </div>
      )}
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ scale: `${1 - 0.25 * c.nivelPinca}` }}>
        <circle cx="22" cy="22" r="19" fill={c.pincando ? '#ff9800' : '#fff'} stroke="#2f4a2f" strokeWidth="3" opacity="0.95" />
        <path d="M14 28 C 14 16, 24 12, 31 12 C 31 20, 27 30, 14 28 Z" fill="#4caf50" stroke="#2f4a2f" strokeWidth="2" />
        <path d="M14 28 L 26 17" stroke="#2f4a2f" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

/**
 * Camada que permite "clicar" botões com a mão: elementos com o atributo
 * `data-mao-clicavel` são acionados pela pinça ou por permanência do cursor.
 * Usada nas telas de instrução, pausa e resultado do jogo de mãos.
 */
export function CamadaMaoClicavel({ ativo }: { ativo: boolean }) {
  const { config } = useConfig()
  const [progresso, setProgresso] = useState(0)
  const hover = useRef<{ el: HTMLElement | null; desde: number }>({ el: null, desde: 0 })
  const c = useCursorMao(ativo, (e) => {
    if (config.controleMao !== 'pinca') return
    if (e.tipo === 'pinca_inicio') {
      alvoSobCursor(e.x, e.y, '[data-mao-clicavel]', 16)?.click()
    }
  })

  useEffect(() => {
    if (!ativo) return
    const el = c.visivel ? alvoSobCursor(c.x, c.y, '[data-mao-clicavel]', 16) : null
    document.querySelectorAll('.mao-hover').forEach((n) => n !== el && n.classList.remove('mao-hover'))
    el?.classList.add('mao-hover')
    const agora = performance.now()
    if (el !== hover.current.el) {
      hover.current = { el, desde: agora }
      setProgresso(0)
      return
    }
    if (el && config.controleMao === 'permanencia') {
      const p = (agora - hover.current.desde) / config.tempoPermanenciaMs
      if (p >= 1) {
        hover.current = { el: null, desde: agora + 99999 }
        setProgresso(0)
        el.click()
      } else setProgresso(p)
    }
  }, [ativo, c.x, c.y, c.visivel, config.controleMao, config.tempoPermanenciaMs])

  useEffect(() => () => document.querySelectorAll('.mao-hover').forEach((n) => n.classList.remove('mao-hover')), [])
  if (!ativo) return null
  return <CursorIlustrado c={c} progresso={progresso} />
}
