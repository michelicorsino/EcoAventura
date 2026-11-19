import { describe, expect, it } from 'vitest'
import { CLASSES, GRUPOS_SEMELHANTES, type Classe } from '../data/categorias'
import type { ImagemJogo } from '../services/classifierApi'
import { DetectorPinca } from '../vision/pinchDetection'
import { montarRodadasConexao, montarRodadasQuiz, pontuarQuiz, posicoesAlternadas } from '../games/sorteio'

const imagens: ImagemJogo[] = CLASSES.flatMap((c) =>
  [1, 2, 3, 4].map((n) => ({
    id: `${c}_00${n}`,
    classe: c as Classe,
    url: `/imagens/${c}/${n}.jpg`,
    origem: 'teste',
    revisada: true,
    provisoria: false,
  })),
)

function gerador(semente: number) {
  let s = semente
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

describe('pontuação do Desafio do Piscar', () => {
  it('100 por acerto, +50 a cada 3 seguidos, erro = 0 e zera a sequência', () => {
    let seq = 0
    let total = 0
    for (const acerto of [true, true, true, false, true, true, true, true, true, true]) {
      const r = pontuarQuiz(acerto, seq)
      seq = r.sequencia
      total += r.pontos + r.bonus
      expect(r.pontos + r.bonus).toBeGreaterThanOrEqual(0)
    }
    // 9 acertos = 900; bônus ao completar 3, 3 e 6 seguidos = 150
    expect(total).toBe(1050)
  })
})

describe('sorteio do quiz', () => {
  for (const semente of [1, 7, 42, 99]) {
    const rodadas = montarRodadasQuiz(imagens, 10, gerador(semente))
    it(`semente ${semente}: 10 rodadas, 4 alternativas distintas, 1 correta, sem repetir imagem`, () => {
      expect(rodadas).toHaveLength(10)
      for (const r of rodadas) {
        expect(new Set(r.opcoes).size).toBe(4)
        expect(r.opcoes.filter((o) => o === r.imagem.classe)).toHaveLength(1)
        expect(r.opcoes[r.correta]).toBe(r.imagem.classe)
      }
      expect(new Set(rodadas.map((r) => r.imagem.id)).size).toBe(10)
    })
  }
  it('posição da resposta correta nunca se repete em rodadas seguidas e é equilibrada', () => {
    const p = posicoesAlternadas(40, gerador(3))
    for (let i = 1; i < p.length; i++) expect(p[i]).not.toBe(p[i - 1])
    for (const k of [0, 1, 2, 3]) expect(p.filter((x) => x === k)).toHaveLength(10)
  })
})

describe('sorteio da Conexão Ecológica', () => {
  const pares = (cs: string[]) => GRUPOS_SEMELHANTES.reduce((n, g) => n + Math.max(0, cs.filter((c) => g.includes(c as Classe)).length - 1), 0)
  for (const semente of [1, 7, 42, 99]) {
    const rodadas = montarRodadasConexao(imagens, 5, gerador(semente))
    it(`semente ${semente}: 5 rodadas com 4 classes distintas e categorias correspondentes`, () => {
      expect(rodadas).toHaveLength(5)
      for (const r of rodadas) {
        const classes = r.imagens.map((i) => i.classe)
        expect(new Set(classes).size).toBe(4)
        expect([...r.categorias].sort()).toEqual([...classes].sort())
      }
    })
    it(`semente ${semente}: dificuldade progressiva (1ª rodada sem parecidas, última com várias)`, () => {
      expect(pares(rodadas[0].categorias)).toBe(0)
      expect(pares(rodadas[4].categorias)).toBeGreaterThanOrEqual(2)
    })
  }
})

describe('DetectorPinca', () => {
  it('usa histerese e exige 2 quadros para mudar', () => {
    const d = new DetectorPinca({ aberta: 1, fechada: 0.2 })
    expect(d.atualizar(0.25, true).inicio).toBe(false)
    expect(d.atualizar(0.25, true).inicio).toBe(true)
    // entre os limiares (0,48 e 0,68): continua pinçando
    expect(d.atualizar(0.55, true).pincando).toBe(true)
    d.atualizar(0.9, true)
    expect(d.atualizar(0.9, true).fim).toBe(true)
  })
  it('mão perdida encerra a pinça', () => {
    const d = new DetectorPinca({ aberta: 1, fechada: 0.2 })
    d.atualizar(0.2, true)
    d.atualizar(0.2, true)
    expect(d.atualizar(1, false).fim).toBe(true)
  })
})
