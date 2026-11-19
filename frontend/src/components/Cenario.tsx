import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/** Fundo ilustrado: céu, nuvens, colinas, árvores e grama. Puramente decorativo. */
export function Cenario({ children, saude = 1 }: { children: ReactNode; saude?: number }) {
  // `saude` (0–1) deixa o cenário mais verde conforme o ambiente é recuperado.
  // Nas telas de jogo as nuvens ficam paradas: a animação redesenhava o fundo inteiro a cada quadro.
  const parado = useLocation().pathname.startsWith('/jogo')
  const verde = `hsl(${95 + saude * 15} ${45 + saude * 20}% ${52 - saude * 6}%)`
  return (
    <div className={`cenario ${parado ? 'cenario-parado' : ''}`}>
      <svg className="cenario-fundo" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <defs>
          <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7fd3f7" />
            <stop offset="1" stopColor="#d9f3ff" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#ceu)" />
        <circle cx="1270" cy="120" r="62" fill="#ffe066" />
        <g className="nuvem nuvem-1" fill="#fff">
          <ellipse cx="200" cy="140" rx="80" ry="34" />
          <ellipse cx="250" cy="120" rx="60" ry="40" />
          <ellipse cx="150" cy="128" rx="44" ry="30" />
        </g>
        <g className="nuvem nuvem-2" fill="#fff" opacity="0.9">
          <ellipse cx="900" cy="90" rx="70" ry="28" />
          <ellipse cx="945" cy="74" rx="50" ry="34" />
        </g>
        <path d="M0 640 Q 260 520 520 610 T 1040 600 T 1440 580 V 900 H 0 Z" fill="#a5d6a7" />
        <path d="M0 720 Q 360 620 720 700 T 1440 680 V 900 H 0 Z" fill={verde} style={{ transition: 'fill 1s' }} />
        {[90, 300, 1150, 1340].map((x, i) => (
          <g key={x} transform={`translate(${x} ${660 + (i % 2) * 20})`}>
            <rect x="-8" y="0" width="16" height="70" rx="4" fill="#8d6e63" />
            <circle cx="0" cy="-10" r={48 - (i % 2) * 8} fill="#43a047" stroke="#2f4a2f" strokeWidth="3" />
          </g>
        ))}
        <rect y="860" width="1440" height="40" fill="#558b2f" />
      </svg>
      <div className="cenario-conteudo">{children}</div>
    </div>
  )
}
