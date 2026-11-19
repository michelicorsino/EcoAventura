// Personagens originais em SVG (contorno suave, estilo 2D consistente).
type Humor = 'feliz' | 'animado' | 'pensando' | 'triste'

interface Props {
  tamanho?: number
  humor?: Humor
  className?: string
}

const CONTORNO = '#2f4a2f'

function Rosto({ cx, cy, humor, escala = 1 }: { cx: number; cy: number; humor: Humor; escala?: number }) {
  const e = escala
  const boca =
    humor === 'triste'
      ? `M ${cx - 9 * e} ${cy + 14 * e} Q ${cx} ${cy + 6 * e} ${cx + 9 * e} ${cy + 14 * e}`
      : humor === 'pensando'
        ? `M ${cx - 7 * e} ${cy + 11 * e} L ${cx + 7 * e} ${cy + 9 * e}`
        : `M ${cx - 11 * e} ${cy + 7 * e} Q ${cx} ${cy + (humor === 'animado' ? 22 : 17) * e} ${cx + 11 * e} ${cy + 7 * e}`
  return (
    <g>
      <ellipse cx={cx - 12 * e} cy={cy - 4 * e} rx={4.5 * e} ry={6 * e} fill={CONTORNO} />
      <ellipse cx={cx + 12 * e} cy={cy - 4 * e} rx={4.5 * e} ry={6 * e} fill={CONTORNO} />
      <circle cx={cx - 10.5 * e} cy={cy - 6 * e} r={1.6 * e} fill="#fff" />
      <circle cx={cx + 13.5 * e} cy={cy - 6 * e} r={1.6 * e} fill="#fff" />
      <ellipse cx={cx - 21 * e} cy={cy + 6 * e} rx={5 * e} ry={3 * e} fill="#ff8a80" opacity={0.55} />
      <ellipse cx={cx + 21 * e} cy={cy + 6 * e} rx={5 * e} ry={3 * e} fill="#ff8a80" opacity={0.55} />
      <path
        d={boca}
        stroke={CONTORNO}
        strokeWidth={3 * e}
        fill={humor === 'animado' ? '#c0392b' : 'none'}
        strokeLinecap="round"
      />
    </g>
  )
}

/** Gotinha d'água. */
export function Gotinha({ tamanho = 120, humor = 'feliz', className }: Props) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 120 120" role="img" aria-label="Gotinha">
      <path
        d="M60 8 C 78 34, 98 54, 98 76 A 38 38 0 0 1 22 76 C 22 54, 42 34, 60 8 Z"
        fill="#4fc3f7"
        stroke={CONTORNO}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M40 62 Q 38 48 50 36" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.7" />
      <Rosto cx={60} cy={76} humor={humor} escala={0.9} />
    </svg>
  )
}

/** Árvore sorridente. */
export function Arvore({ tamanho = 140, humor = 'feliz', className }: Props) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 140 140" role="img" aria-label="Árvore">
      <path d="M60 90 L58 132 L82 132 L80 90 Z" fill="#a1694a" stroke={CONTORNO} strokeWidth="3" strokeLinejoin="round" />
      <path
        d="M70 10 C 98 10, 120 28, 118 52 C 132 62, 128 92, 104 96 C 96 108, 74 108, 70 100 C 62 108, 40 108, 34 96 C 10 92, 8 62, 22 52 C 20 28, 42 10, 70 10 Z"
        fill="#66bb6a"
        stroke={CONTORNO}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="40" r="6" fill="#ff7043" stroke={CONTORNO} strokeWidth="2" />
      <circle cx="104" cy="70" r="6" fill="#ff7043" stroke={CONTORNO} strokeWidth="2" />
      <Rosto cx={70} cy={62} humor={humor} />
    </svg>
  )
}

/** Robô reciclador. */
export function Robo({ tamanho = 130, humor = 'feliz', className }: Props) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 130 130" role="img" aria-label="Robô reciclador">
      <line x1="65" y1="10" x2="65" y2="24" stroke={CONTORNO} strokeWidth="3" />
      <circle cx="65" cy="9" r="6" fill="#ffca28" stroke={CONTORNO} strokeWidth="3" />
      <rect x="25" y="24" width="80" height="60" rx="18" fill="#90caf9" stroke={CONTORNO} strokeWidth="3" />
      <rect x="35" y="34" width="60" height="40" rx="12" fill="#e3f2fd" />
      <Rosto cx={65} cy={52} humor={humor} escala={0.75} />
      <rect x="35" y="86" width="60" height="34" rx="10" fill="#4caf50" stroke={CONTORNO} strokeWidth="3" />
      <path
        d="M57 96 l8 -6 l8 6 M73 96 l-3 9 h-10 M57 96 l3 9"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="12" y="90" width="18" height="10" rx="5" fill="#90caf9" stroke={CONTORNO} strokeWidth="3" />
      <rect x="100" y="90" width="18" height="10" rx="5" fill="#90caf9" stroke={CONTORNO} strokeWidth="3" />
    </svg>
  )
}

/** Muda que vira árvore — usada na animação de recuperação do ambiente. */
export function Muda({ crescimento, tamanho = 70 }: { crescimento: number; tamanho?: number }) {
  const s = 0.35 + 0.65 * Math.max(0, Math.min(1, crescimento))
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 70 70" aria-hidden>
      <g style={{ transform: `scale(${s})`, transformOrigin: '35px 68px', transition: 'transform .8s cubic-bezier(.34,1.56,.64,1)' }}>
        <rect x="32" y="40" width="6" height="28" rx="2" fill="#8d6e63" />
        <circle cx="35" cy="32" r="20" fill={crescimento > 0 ? '#66bb6a' : '#c5e1a5'} stroke={CONTORNO} strokeWidth="2.5" />
        {crescimento >= 1 && <circle cx="27" cy="28" r="3.5" fill="#ff7043" />}
      </g>
    </svg>
  )
}
