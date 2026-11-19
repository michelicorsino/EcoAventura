// Sons curtos gerados com Web Audio (sem arquivos). Respeitam o botão de som.
let ctx: AudioContext | null = null
let ativo = true

export function definirSomAtivo(v: boolean) {
  ativo = v
}

function nota(freq: number, inicio: number, dur: number, tipo: OscillatorType = 'sine', vol = 0.12) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = tipo
  o.frequency.value = freq
  const t = ctx.currentTime + inicio
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function tocar(f: () => void) {
  if (!ativo) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    f()
  } catch {
    /* áudio indisponível */
  }
}

export const som = {
  acerto: () => tocar(() => [523, 659, 784].forEach((f, i) => nota(f, i * 0.09, 0.25, 'triangle'))),
  erro: () => tocar(() => [330, 262].forEach((f, i) => nota(f, i * 0.14, 0.3, 'sine', 0.08))),
  clique: () => tocar(() => nota(880, 0, 0.08, 'triangle', 0.06)),
  gesto: () => tocar(() => nota(660, 0, 0.1, 'sine', 0.05)),
  vitoria: () => tocar(() => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => nota(f, i * 0.12, 0.3, 'triangle'))),
}
