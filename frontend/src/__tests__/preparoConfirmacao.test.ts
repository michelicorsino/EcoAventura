import { describe, expect, it } from 'vitest'
import {
  DetectorConfirmacao,
  DetectorPiscadas,
  opcaoDoComando,
  type CalibracaoOlhos,
  type ComandoPiscada,
} from '../vision/blinkDetection'
import type { QuadroFace } from '../vision/faceTracking'

const cal: CalibracaoOlhos = {
  canalEsquerdo: 'A',
  aberto: { esq: 0.05, dir: 0.05 },
  fechado: { esq: 0.75, dir: 0.75 },
  vazamento: { esq: 0.2, dir: 0.2 },
  confiabilidade: 'alta',
  motivos: [],
}
const A = 0.05
const F = 0.8

/** Segmentos: [ms, olho esquerdo, olho direito, yaw (opcional), boca (opcional)] */
type Seg = [number, number, number, number?, number?]
function rodar(f: (q: QuadroFace) => void, segs: Seg[], t0 = { t: 1000 }) {
  for (const [dur, e, d, yaw = 0, boca = 0] of segs) {
    for (let k = 0; k < dur; k += 33) {
      t0.t += 33
      f({ t: t0.t, detectado: true, canalA: e, canalB: d, boca, yaw, pitch: 0.5 })
    }
  }
}

function comandos(segs: Seg[]) {
  const det = new DetectorPiscadas(cal, { janelaDuplaMs: 900, cooldownMs: 600, preparoMs: 1000, duracaoMinMs: 150 })
  const cmds: ComandoPiscada[] = []
  const descartes: string[] = []
  rodar((q) => {
    const s = det.atualizar(q)
    if (s.comando) cmds.push(s.comando)
    if (s.descartado) descartes.push(s.descartado)
  }, segs)
  return { opcoes: cmds.map(opcaoDoComando), descartes }
}

describe('espera a criança se preparar', () => {
  it('piscada logo no início (sem 1 s de olhos abertos) é ignorada', () => {
    const r = comandos([[300, A, A], [250, F, A], [2000, A, A]])
    expect(r.opcoes).toEqual([])
    expect(r.descartes).toContain('cedo demais')
  })
  it('depois de 1 s de olhos abertos e cabeça parada, a piscada vale', () => {
    expect(comandos([[1200, A, A], [250, F, A], [2000, A, A]]).opcoes).toEqual([0])
  })
  it('piscada com a cabeça se mexendo é ignorada', () => {
    // cabeça girando ~1,6 distância interocular/s durante a piscada
    const segs: Seg[] = [[1200, A, A]]
    for (let i = 0; i < 8; i++) segs.push([33, F, A, i * 0.05])
    segs.push([2000, A, A, 0.4])
    const r = comandos(segs)
    expect(r.opcoes).toEqual([])
    expect(r.descartes).toContain('a cabeça estava se mexendo')
  })
  it('“piscada” rápida demais (< 150 ms) é ignorada', () => {
    const r = comandos([[1200, A, A], [80, F, A], [2000, A, A]])
    expect(r.opcoes).toEqual([])
    expect(r.descartes).toContain('piscada rápida demais')
  })
  it('depois de um comando é preciso se preparar de novo', () => {
    // 2ª piscada logo depois do 1º comando não conta
    expect(comandos([[1200, A, A], [250, F, A], [1000, A, A], [250, A, F], [2000, A, A]]).opcoes).toEqual([0])
  })
})

describe('DetectorConfirmacao', () => {
  const seguir = (det: DetectorConfirmacao, segs: Seg[], t0 = { t: 1000 }) => {
    let n = 0
    let max = 0
    rodar((q) => {
      const s = det.atualizar(q)
      if (s.confirmou) n++
      max = Math.max(max, s.progresso)
    }, segs, t0)
    return { n, max }
  }

  it('olhos: fechar os dois olhos por 1 s confirma (uma vez só)', () => {
    const det = new DetectorConfirmacao('olhos', 1000, cal)
    expect(seguir(det, [[300, A, A], [1500, F, F], [300, A, A]]).n).toBe(1)
  })
  it('olhos: piscadas naturais (rápidas) não confirmam', () => {
    const det = new DetectorConfirmacao('olhos', 1000, cal)
    const r = seguir(det, [[300, A, A], [150, F, F], [500, A, A], [200, F, F], [500, A, A]])
    expect(r.n).toBe(0)
    expect(r.max).toBeLessThan(0.3)
  })
  it('olhos: piscar só um olho não confirma', () => {
    const det = new DetectorConfirmacao('olhos', 1000, cal)
    expect(seguir(det, [[300, A, A], [1500, F, A], [300, A, A]]).n).toBe(0)
  })
  it('olhos: gesto que já vinha acontecendo não conta — precisa abrir e fechar de novo', () => {
    const det = new DetectorConfirmacao('olhos', 1000, cal)
    expect(seguir(det, [[1500, F, F]]).n).toBe(0)
  })
  it('boca: abrir a boca e segurar confirma; falar rapidinho não', () => {
    const det = new DetectorConfirmacao('boca', 800)
    expect(seguir(det, [[300, A, A, 0, 0], [200, A, A, 0, 0.6], [200, A, A, 0, 0], [200, A, A, 0, 0.6], [300, A, A, 0, 0]]).n).toBe(0)
    expect(seguir(det, [[300, A, A, 0, 0], [1000, A, A, 0, 0.6], [300, A, A, 0, 0]], { t: 9000 }).n).toBe(1)
  })
  it('bloqueio (feedback na tela) impede confirmar', () => {
    const det = new DetectorConfirmacao('olhos', 1000, cal)
    const t = { t: 1000 }
    seguir(det, [[300, A, A]], t)
    det.reiniciar(5000)
    expect(seguir(det, [[300, A, A], [1500, F, F], [300, A, A]], t).n).toBe(0)
  })
})
