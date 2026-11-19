/**
 * Filtro "One Euro" (Casiez et al., 2012): suaviza bastante quando a mão
 * está parada (tira tremor) e pouco quando ela se move rápido (sem atraso).
 */
class FiltroPassaBaixa {
  private y: number | null = null
  filtrar(x: number, alpha: number) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y
    return this.y
  }
  reset() {
    this.y = null
  }
  get valor() {
    return this.y
  }
}

const alpha = (corte: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * corte)
  return 1 / (1 + tau / dt)
}

export class FiltroUmEuro {
  private x = new FiltroPassaBaixa()
  private dx = new FiltroPassaBaixa()
  private tAnterior: number | null = null
  minCorte: number
  beta: number
  dCorte: number

  constructor(minCorte = 1.0, beta = 0.02, dCorte = 1.0) {
    this.minCorte = minCorte
    this.beta = beta
    this.dCorte = dCorte
  }

  filtrar(v: number, tMs: number) {
    if (this.tAnterior === null) {
      this.tAnterior = tMs
      this.dx.filtrar(0, 1)
      return this.x.filtrar(v, 1)
    }
    const dt = Math.max(1e-3, (tMs - this.tAnterior) / 1000)
    this.tAnterior = tMs
    const anterior = this.x.valor ?? v
    const deriv = this.dx.filtrar((v - anterior) / dt, alpha(this.dCorte, dt))
    const corte = this.minCorte + this.beta * Math.abs(deriv)
    return this.x.filtrar(v, alpha(corte, dt))
  }

  reset() {
    this.x.reset()
    this.dx.reset()
    this.tAnterior = null
  }
}

/** Suavização 2D; `nivel` 0 (rápido) a 1 (bem suave). */
export class Suavizador2D {
  private fx: FiltroUmEuro
  private fy: FiltroUmEuro
  constructor(nivel = 0.5) {
    const minCorte = 3.0 - 2.5 * nivel // 3 Hz → 0.5 Hz
    this.fx = new FiltroUmEuro(minCorte, 0.004)
    this.fy = new FiltroUmEuro(minCorte, 0.004)
  }
  filtrar(x: number, y: number, t: number) {
    return { x: this.fx.filtrar(x, t), y: this.fy.filtrar(y, t) }
  }
  reset() {
    this.fx.reset()
    this.fy.reset()
  }
}
