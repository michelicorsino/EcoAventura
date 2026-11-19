import { describe, expect, it } from 'vitest'
import { DetectorBalancoCabeca, DetectorPiscadas, type CalibracaoOlhos } from '../vision/blinkDetection'
import type { QuadroFace } from '../vision/faceTracking'

const quadro = (t: number, yaw: number): QuadroFace => ({ t, detectado: true, canalA: 0.05, canalB: 0.05, boca: 0, yaw, pitch: 0.5 })

/** Move o yaw linearmente por cada alvo em `ms` milissegundos (30 fps). */
function trajetoria(det: DetectorBalancoCabeca, alvos: [number, number][], relogio = { t: 1000, yaw: 0 }) {
  let n = 0
  for (const [yaw, ms] of alvos) {
    const passos = Math.max(1, Math.round(ms / 33))
    const y0 = relogio.yaw
    for (let i = 1; i <= passos; i++) {
      relogio.t += 33
      relogio.yaw = y0 + ((yaw - y0) * i) / passos
      if (det.atualizar(quadro(relogio.t, relogio.yaw))) n++
    }
  }
  return n
}

describe('DetectorBalancoCabeca (voltar)', () => {
  it('balançar a cabeça dizendo "não" (esq-dir-esq) é reconhecido uma vez', () => {
    const det = new DetectorBalancoCabeca()
    expect(trajetoria(det, [[0, 300], [-0.2, 250], [0.2, 300], [-0.2, 300], [0, 250], [0, 1500]])).toBe(1)
  })
  it('virar a cabeça para um lado só (olhar para o lado) não conta', () => {
    const det = new DetectorBalancoCabeca()
    expect(trajetoria(det, [[0, 300], [0.3, 400], [0.3, 1000], [0, 400], [0, 1000]])).toBe(0)
  })
  it('tremidinhas pequenas não contam', () => {
    const det = new DetectorBalancoCabeca()
    const alvos: [number, number][] = []
    for (let i = 0; i < 10; i++) alvos.push([i % 2 ? 0.04 : -0.04, 150])
    expect(trajetoria(det, alvos)).toBe(0)
  })
  it('movimentos lentos e espaçados (mais que a janela) não somam', () => {
    const det = new DetectorBalancoCabeca()
    expect(trajetoria(det, [[0, 300], [-0.2, 1200], [-0.2, 1000], [0.2, 1200], [0.2, 1000], [-0.2, 1200]])).toBe(0)
  })
})

describe('balançar a cabeça não vira piscada', () => {
  it('fechar um olho enquanto balança a cabeça é ignorado', () => {
    const cal: CalibracaoOlhos = {
      canalEsquerdo: 'A',
      aberto: { esq: 0.05, dir: 0.05 },
      fechado: { esq: 0.75, dir: 0.75 },
      vazamento: { esq: 0.2, dir: 0.2 },
      confiabilidade: 'alta',
      motivos: [],
    }
    const det = new DetectorPiscadas(cal, { janelaDuplaMs: 900, cooldownMs: 600 })
    let t = 0
    let comandos = 0
    for (let i = 0; i < 40; i++) det.atualizar({ ...quadro((t += 33), 0) }) // pronto
    for (let i = 0; i < 30; i++) {
      const yaw = 0.2 * Math.sin(i / 3)
      const fechado = i >= 10 && i < 17
      if (det.atualizar({ ...quadro((t += 33), yaw), canalA: fechado ? 0.8 : 0.05 }).comando) comandos++
    }
    for (let i = 0; i < 60; i++) if (det.atualizar(quadro((t += 33), 0)).comando) comandos++
    expect(comandos).toBe(0)
  })
})
