import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { som } from '../services/som'

type Cor = 'verde' | 'azul' | 'amarelo' | 'laranja' | 'branco'

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  cor?: Cor
  grande?: boolean
  icone?: ReactNode
  /** Permite "clicar" com o cursor da mão (pinça ou permanência). */
  maoClicavel?: boolean
}

export function Botao({ cor = 'verde', grande, icone, maoClicavel = true, className = '', children, onClick, ...rest }: BotaoProps) {
  return (
    <button
      className={`botao botao-${cor} ${grande ? 'botao-grande' : ''} ${className}`}
      data-mao-clicavel={maoClicavel ? '' : undefined}
      onClick={(e) => {
        som.clique()
        onClick?.(e)
      }}
      {...rest}
    >
      {icone && <span className="botao-icone">{icone}</span>}
      <span>{children}</span>
    </button>
  )
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cartao ${className}`}>{children}</div>
}

/** Anel de progresso circular (permanência, janela da piscada dupla etc.). */
export function AnelProgresso({ fracao, tamanho = 44, cor = '#4caf50' }: { fracao: number; tamanho?: number; cor?: string }) {
  const r = tamanho / 2 - 4
  const c = 2 * Math.PI * r
  return (
    <svg width={tamanho} height={tamanho} className="anel" aria-hidden>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} stroke="rgba(0,0,0,.12)" strokeWidth="5" fill="none" />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={r}
        stroke={cor}
        strokeWidth="5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fracao)))}
        strokeLinecap="round"
        transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
      />
    </svg>
  )
}

/** Confetes, folhas e estrelas — dura ~1,6 s. */
export function Confetes({ disparo }: { disparo: number }) {
  const [pecas, setPecas] = useState<{ id: number; x: number; d: number; s: string; r: number }[]>([])
  useEffect(() => {
    if (!disparo) return
    const simbolos = ['🍃', '⭐', '♻️', '🌿', '✨', '🌼']
    setPecas(
      Array.from({ length: 22 }, (_, i) => ({
        id: disparo * 100 + i,
        x: Math.random() * 100,
        d: Math.random() * 0.4,
        s: simbolos[i % simbolos.length],
        r: Math.random() * 360,
      })),
    )
    const t = setTimeout(() => setPecas([]), 1800)
    return () => clearTimeout(t)
  }, [disparo])
  return (
    <div className="confetes" aria-hidden>
      {pecas.map((p) => (
        <span key={p.id} style={{ left: `${p.x}%`, animationDelay: `${p.d}s`, rotate: `${p.r}deg` }}>
          {p.s}
        </span>
      ))}
    </div>
  )
}

/** Ícone de olho com indicação de piscadas (para a grade de alternativas). */
export function IconeOlho({ olho, vezes }: { olho: 'esquerdo' | 'direito'; vezes: 1 | 2 }) {
  const um = (k: number) => (
    <svg key={k} width="30" height="22" viewBox="0 0 30 22" aria-hidden>
      <path d="M2 11 Q 15 -2 28 11 Q 15 24 2 11 Z" fill="#fff" stroke="#2f4a2f" strokeWidth="2" />
      <path d="M4 11 Q 15 18 26 11" stroke="#2f4a2f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  )
  return (
    <span className="icone-olho" title={`${vezes === 1 ? '1 piscada' : '2 piscadas'} do olho ${olho}`}>
      {vezes === 2 ? [um(1), um(2)] : um(1)}
      <small>
        {vezes}× {olho === 'esquerdo' ? 'esq.' : 'dir.'}
      </small>
    </span>
  )
}

export function BarraProgresso({ atual, total }: { atual: number; total: number }) {
  return (
    <div className="barra-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={atual}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < atual ? 'feito' : i === atual ? 'atual' : ''} />
      ))}
    </div>
  )
}
