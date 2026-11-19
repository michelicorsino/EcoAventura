import { describe, expect, it } from 'vitest'
import {
  DetectorCabeca,
  DetectorPiscadas,
  montarCalibracaoOlhos,
  opcaoDoComando,
  type CalibracaoOlhos,
  type ComandoPiscada,
} from '../vision/blinkDetection'
import type { QuadroFace } from '../vision/faceTracking'

// Calibração sintética: canal B = olho esquerdo (o MediaPipe pode reportar espelhado)
const cal: CalibracaoOlhos = {
  canalEsquerdo: 'B',
  aberto: { esq: 0.05, dir: 0.05 },
  fechado: { esq: 0.75, dir: 0.75 },
  vazamento: { esq: 0.2, dir: 0.2 },
  confiabilidade: 'alta',
  motivos: [],
}

let relogio = 1000
/** Gera quadros a ~30 fps a partir de segmentos [duração ms, olho esquerdo, olho direito]. */
function simular(det: DetectorPiscadas, segmentos: [number, number, number][]) {
  const comandos: ComandoPiscada[] = []
  let bilaterais = 0
  for (const [dur, e, d] of segmentos) {
    for (let k = 0; k < dur; k += 33) {
      relogio += 33
      const s = det.atualizar({ t: relogio, detectado: true, canalA: d, canalB: e, boca: 0, yaw: 0, pitch: 0 })
      if (s.comando) comandos.push(s.comando)
      if (s.bilateral) bilaterais++
    }
  }
  return { comandos, bilaterais, opcoes: comandos.map(opcaoDoComando) }
}

const novo = () => new DetectorPiscadas(cal, { janelaDuplaMs: 900, cooldownMs: 600 })
const A = 0.05 // aberto
const F = 0.8 // fechado

describe('DetectorPiscadas', () => {
  it('1 piscada do olho esquerdo → A, confirmada só depois da janela', () => {
    const det = novo()
    expect(simular(det, [[1000, A, A], [250, F, A], [500, A, A]]).comandos).toHaveLength(0)
    expect(simular(det, [[600, A, A]]).opcoes).toEqual([0])
  })

  it('1 piscada do olho direito → B', () => {
    expect(simular(novo(), [[1000, A, A], [250, A, F], [1200, A, A]]).opcoes).toEqual([1])
  })

  it('2 piscadas do olho esquerdo → C', () => {
    expect(simular(novo(), [[1000, A, A], [200, F, A], [300, A, A], [200, F, A], [1200, A, A]]).opcoes).toEqual([2])
  })

  it('2 piscadas do olho direito → D', () => {
    expect(simular(novo(), [[1000, A, A], [200, A, F], [300, A, A], [200, A, F], [1200, A, A]]).opcoes).toEqual([3])
  })

  it('piscadas com os dois olhos (involuntárias) são ignoradas', () => {
    const r = simular(novo(), [[1000, A, A], [150, F, F], [400, A, A], [150, F, F], [1500, A, A]])
    expect(r.comandos).toHaveLength(0)
    // a 1ª é reconhecida como bilateral; a 2ª nem chega a contar (a criança ainda não estava pronta de novo)
    expect(r.bilaterais).toBeGreaterThanOrEqual(1)
  })

  it('segunda piscada fora da janela gera dois comandos simples', () => {
    expect(simular(novo(), [[1000, A, A], [200, F, A], [2500, A, A], [200, F, A], [1500, A, A]]).opcoes).toEqual([0, 0])
  })

  it('olhos fechados por muito tempo não viram comando', () => {
    expect(simular(novo(), [[1000, A, A], [3000, F, A], [1500, A, A]]).comandos).toHaveLength(0)
  })

  it('fechamento de um único quadro (ruído) é ignorado', () => {
    expect(simular(novo(), [[1000, A, A], [33, F, A], [1500, A, A]]).comandos).toHaveLength(0)
  })

  it('perder o rosto descarta a piscada pendente', () => {
    const det = novo()
    simular(det, [[1000, A, A], [200, F, A], [200, A, A]])
    relogio += 33
    det.atualizar({ t: relogio, detectado: false, canalA: 0, canalB: 0, boca: 0, yaw: 0, pitch: 0 })
    expect(simular(det, [[1500, A, A]]).comandos).toHaveLength(0)
  })

  it('reiniciar com bloqueio (feedback na tela) ignora piscadas no período', () => {
    const det = novo()
    simular(det, [[100, A, A]]) // quadros já chegando
    det.reiniciar(5000)
    expect(simular(det, [[1000, A, A], [200, F, A], [1500, A, A]]).comandos).toHaveLength(0)
  })
})

describe('montarCalibracaoOlhos', () => {
  const abertos = Array.from({ length: 10 }, () => ({ a: 0.05, b: 0.06 }))
  it('descobre qual canal é o olho esquerdo', () => {
    const esq = Array.from({ length: 10 }, () => ({ a: 0.1, b: 0.8 }))
    const dir = Array.from({ length: 10 }, () => ({ a: 0.7, b: 0.12 }))
    const c = montarCalibracaoOlhos(abertos, esq, dir)!
    expect(c.canalEsquerdo).toBe('B')
    expect(c.confiabilidade).toBe('alta')
  })
  it('marca baixa confiabilidade quando o outro olho fecha junto', () => {
    const esq = Array.from({ length: 10 }, () => ({ a: 0.55, b: 0.8 }))
    const dir = Array.from({ length: 10 }, () => ({ a: 0.8, b: 0.5 }))
    expect(montarCalibracaoOlhos(abertos, esq, dir)!.confiabilidade).toBe('baixa')
  })
  it('rejeita coletas incoerentes (o mesmo canal subiu nas duas)', () => {
    const igual = Array.from({ length: 10 }, () => ({ a: 0.8, b: 0.1 }))
    expect(montarCalibracaoOlhos(abertos, igual, igual)).toBeNull()
  })
})

describe('DetectorCabeca (modo alternativo)', () => {
  const calC = { yaw0: 0, pitch0: 0.5, boca0: 0.02, bocaAberta: 0.6 }
  const q = (t: number, yaw: number, pitch: number, boca = 0.02): QuadroFace => ({
    t,
    detectado: true,
    canalA: 0,
    canalB: 0,
    boca,
    yaw,
    pitch,
  })
  it('permanência no canto inferior direito → D', () => {
    const d = new DetectorCabeca(calC, 'cabeca', 1000)
    let cmd: number | undefined
    for (let t = 0; t < 1500; t += 33) cmd = d.atualizar(q(t, 0.3, 0.7)).comando ?? cmd
    expect(cmd).toBe(3)
  })
  it('modo boca: aponta ↖ e abre a boca → A; precisa voltar ao centro antes do próximo', () => {
    const d = new DetectorCabeca(calC, 'boca', 1000)
    d.atualizar(q(0, -0.3, 0.3))
    expect(d.atualizar(q(33, -0.3, 0.3, 0.7)).comando).toBe(0)
    d.atualizar(q(66, -0.3, 0.3, 0.02))
    expect(d.atualizar(q(99, -0.3, 0.3, 0.7)).comando).toBeUndefined()
    d.atualizar(q(132, 0, 0.5)) // volta ao centro
    d.atualizar(q(165, -0.3, 0.3))
    expect(d.atualizar(q(198, -0.3, 0.3, 0.7)).comando).toBe(0)
  })
})
