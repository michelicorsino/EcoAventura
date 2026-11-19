import { CLASSES, GRUPOS_SEMELHANTES, PARECIDAS, type Classe } from '../data/categorias'
import type { ImagemJogo } from '../services/classifierApi'

export function embaralhar<T>(v: readonly T[], rng = Math.random): T[] {
  const a = [...v]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Agrupa as imagens por classe, preferindo fotografias reais às provisórias. */
export function porClasse(imagens: ImagemJogo[]): Map<Classe, ImagemJogo[]> {
  const m = new Map<Classe, ImagemJogo[]>()
  for (const c of CLASSES) {
    const da = imagens.filter((i) => i.classe === c)
    const reais = da.filter((i) => !i.provisoria)
    if (da.length) m.set(c, reais.length ? reais : da)
  }
  return m
}

/** Escolhe uma imagem da classe evitando repetir ids já usados. */
function escolherImagem(m: Map<Classe, ImagemJogo[]>, c: Classe, usados: Set<string>, rng: () => number) {
  const lista = embaralhar(m.get(c) ?? [], rng)
  const img = lista.find((i) => !usados.has(i.id)) ?? lista[0]
  if (img) usados.add(img.id)
  return img
}

/* ------------------------------------------------ Desafio do Piscar ---- */

export interface RodadaQuiz {
  imagem: ImagemJogo
  opcoes: Classe[]
  correta: 0 | 1 | 2 | 3
}

/** Posições da resposta correta: equilibradas e nunca iguais em rodadas seguidas. */
export function posicoesAlternadas(n: number, rng = Math.random): (0 | 1 | 2 | 3)[] {
  const res: (0 | 1 | 2 | 3)[] = []
  while (res.length < n) {
    const bloco = embaralhar([0, 1, 2, 3] as const, rng)
    if (res.length && bloco[0] === res[res.length - 1]) [bloco[0], bloco[1]] = [bloco[1], bloco[0]]
    res.push(...bloco)
  }
  return res.slice(0, n)
}

export function distratores(correta: Classe, rng = Math.random): Classe[] {
  const parecidas = embaralhar(PARECIDAS[correta], rng).slice(0, 2)
  const outras = embaralhar(
    CLASSES.filter((c) => c !== correta && !parecidas.includes(c)),
    rng,
  )
  return [...parecidas, outras[0]]
}

export function montarRodadasQuiz(imagens: ImagemJogo[], n = 10, rng = Math.random): RodadaQuiz[] {
  const m = porClasse(imagens)
  const disponiveis = [...m.keys()]
  if (!disponiveis.length) return []
  // Classes diferentes a cada rodada (12 classes ≥ 10 rodadas)
  const ordem: Classe[] = []
  while (ordem.length < n) ordem.push(...embaralhar(disponiveis, rng))
  const posicoes = posicoesAlternadas(n, rng)
  const usados = new Set<string>()
  return ordem.slice(0, n).map((classe, i) => {
    const imagem = escolherImagem(m, classe, usados, rng)
    const erradas = embaralhar(distratores(classe, rng), rng)
    const opcoes: Classe[] = []
    for (let k = 0; k < 4; k++) opcoes.push(k === posicoes[i] ? classe : erradas.pop()!)
    return { imagem, opcoes, correta: posicoes[i] }
  })
}

export const PONTOS_ACERTO = 100
export const BONUS_SEQUENCIA = 50

/** 100 por acerto; +50 a cada 3 acertos seguidos; erro = 0 (nunca negativo). */
export function pontuarQuiz(acertou: boolean, sequenciaAnterior: number) {
  if (!acertou) return { pontos: 0, bonus: 0, sequencia: 0 }
  const sequencia = sequenciaAnterior + 1
  const bonus = sequencia % 3 === 0 ? BONUS_SEQUENCIA : 0
  return { pontos: PONTOS_ACERTO, bonus, sequencia }
}

/* ---------------------------------------------- Conexão Ecológica ----- */

export interface RodadaConexao {
  imagens: ImagemJogo[]
  /** Mesmas classes das imagens, em ordem independente. */
  categorias: Classe[]
  nivel: number
}

const grupoDe = (c: Classe) => GRUPOS_SEMELHANTES.findIndex((g) => g.includes(c))

/**
 * Dificuldade progressiva: rodada 1 só com categorias bem diferentes;
 * depois entram pares e trios visualmente parecidos (vidros, papel/papelão…).
 */
export function classesDoNivel(nivel: number, disponiveis: Classe[], rng = Math.random): Classe[] {
  const grupos = GRUPOS_SEMELHANTES.map((g) => embaralhar(g.filter((c) => disponiveis.includes(c)), rng)).filter((g) => g.length)
  const ordemGrupos = embaralhar(grupos, rng)
  const escolhidas: Classe[] = []
  const usarGrupo = (g: Classe[], k: number) => {
    for (const c of g.slice(0, k)) if (!escolhidas.includes(c) && escolhidas.length < 4) escolhidas.push(c)
  }
  const grandes = ordemGrupos.filter((g) => g.length >= 2)
  const trios = ordemGrupos.filter((g) => g.length >= 3)

  if (nivel >= 3 && trios.length) {
    usarGrupo(trios[0], 3)
    if (nivel >= 4) {
      const vizinhas = embaralhar(trios[0].flatMap((c) => PARECIDAS[c]), rng).filter(
        (c) => !escolhidas.includes(c) && disponiveis.includes(c),
      )
      if (vizinhas[0]) escolhidas.push(vizinhas[0])
    }
  } else if (nivel === 2 && grandes.length >= 2) {
    usarGrupo(grandes[0], 2)
    usarGrupo(grandes[1], 2)
  } else if (nivel >= 1 && grandes.length) {
    usarGrupo(grandes[0], 2)
  }
  // Completa com uma classe de cada grupo ainda não usado
  for (const g of ordemGrupos) {
    if (escolhidas.length >= 4) break
    if (!g.some((c) => escolhidas.includes(c)) || nivel === 0) {
      const c = g.find((x) => !escolhidas.includes(x))
      if (c && (nivel > 0 || !escolhidas.some((e) => grupoDe(e) === grupoDe(c)))) escolhidas.push(c)
    }
  }
  for (const c of embaralhar(disponiveis, rng)) if (escolhidas.length < 4 && !escolhidas.includes(c)) escolhidas.push(c)
  return escolhidas.slice(0, 4)
}

export function montarRodadasConexao(imagens: ImagemJogo[], n = 5, rng = Math.random): RodadaConexao[] {
  const m = porClasse(imagens)
  const disponiveis = [...m.keys()]
  if (disponiveis.length < 4) return []
  const usados = new Set<string>()
  return Array.from({ length: n }, (_, nivel) => {
    const classes = classesDoNivel(nivel, disponiveis, rng)
    const imgs = embaralhar(classes.map((c) => escolherImagem(m, c, usados, rng)), rng)
    // Categorias em ordem diferente da coluna de imagens (evita ligação "reta")
    let categorias = embaralhar(classes, rng)
    for (let k = 0; k < 5 && categorias.some((c, i) => imgs[i].classe === c); k++) categorias = embaralhar(classes, rng)
    return { imagens: imgs, categorias, nivel }
  })
}

export const PONTOS_CONEXAO = 100
export const BONUS_RODADA_PERFEITA = 100
