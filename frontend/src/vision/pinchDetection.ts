/**
 * Gesto de pinça (polegar + indicador).
 * Usa a razão distância(4, 8) / tamanho da mão, com limiares individuais
 * da calibração e histerese (um limiar para fechar, outro maior para abrir),
 * além de exigir alguns quadros seguidos para evitar "piscadas" do gesto.
 */

export interface CalibracaoPinca {
  aberta: number
  fechada: number
}

export const PINCA_PADRAO: CalibracaoPinca = { aberta: 0.9, fechada: 0.2 }

export function montarCalibracaoPinca(abertas: number[], fechadas: number[]): CalibracaoPinca | null {
  if (abertas.length < 5 || fechadas.length < 5) return null
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
  const aberta = med(abertas)
  const fechada = med(fechadas)
  if (aberta - fechada < 0.15) return null // gestos parecidos demais
  return { aberta, fechada }
}

export interface SaidaPinca {
  pincando: boolean
  inicio: boolean
  fim: boolean
  /** 0 = aberta, 1 = pinça completa (para animar o cursor). */
  nivel: number
}

export class DetectorPinca {
  private cal: CalibracaoPinca
  private pincando = false
  private contador = 0
  private readonly quadrosParaMudar = 2

  constructor(cal: CalibracaoPinca = PINCA_PADRAO) {
    this.cal = cal
  }

  get limiarFecha() {
    return this.cal.fechada + 0.35 * (this.cal.aberta - this.cal.fechada)
  }
  get limiarAbre() {
    return this.cal.fechada + 0.6 * (this.cal.aberta - this.cal.fechada)
  }

  reiniciar() {
    this.pincando = false
    this.contador = 0
  }

  atualizar(razao: number, detectado: boolean): SaidaPinca {
    const nivel = Math.max(0, Math.min(1, (this.cal.aberta - razao) / Math.max(0.05, this.cal.aberta - this.cal.fechada)))
    if (!detectado) {
      const fim = this.pincando
      this.reiniciar()
      return { pincando: false, inicio: false, fim, nivel: 0 }
    }
    const querMudar = this.pincando ? razao > this.limiarAbre : razao < this.limiarFecha
    this.contador = querMudar ? this.contador + 1 : 0
    if (this.contador >= this.quadrosParaMudar) {
      this.pincando = !this.pincando
      this.contador = 0
      return { pincando: this.pincando, inicio: this.pincando, fim: !this.pincando, nivel }
    }
    return { pincando: this.pincando, inicio: false, fim: false, nivel }
  }
}
