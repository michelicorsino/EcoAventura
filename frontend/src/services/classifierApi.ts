import type { Classe } from '../data/categorias'

export interface ImagemJogo {
  id: string
  /** Rótulo verdadeiro (manifesto, conferido manualmente). É o gabarito do jogo. */
  classe: Classe
  url: string
  origem: string | null
  revisada: boolean
  provisoria: boolean
}

export interface PrevisaoCNN {
  imagem_id: string | null
  modelo: string
  classe_prevista: Classe
  confianca: number
  probabilidades: Record<string, number>
  tempo_inferencia_ms: number
  cache: boolean
  /** Tempo total medido no navegador (rede + inferência). */
  tempo_total_ms?: number
}

export interface SaudeApi {
  status: 'ok' | 'erro'
  modelo_carregado: boolean
  modelo: string | null
  arquitetura: string | null
  entrada: number[]
  classes: string[]
  parametros: number | null
  verificacoes: Record<string, boolean | string>
  tempo_carregamento_s: number | null
  erro: string | null
  imagens_cadastradas: number
  imagens_revisadas: number
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detalhe = `${r.status}`
    try {
      detalhe = (await r.json()).detail ?? detalhe
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(detalhe)
  }
  return r.json() as Promise<T>
}

export async function obterSaude(): Promise<SaudeApi> {
  return json(await fetch('/api/saude'))
}

export async function listarImagens(): Promise<ImagemJogo[]> {
  const dados = await json<{ imagens: ImagemJogo[] }>(await fetch('/api/imagens'))
  return dados.imagens
}

const cache = new Map<string, Promise<PrevisaoCNN>>()

/**
 * Pede à CNN E8 a classificação da fotografia escolhida pelo jogo (pelo id do manifesto).
 * Nunca envia imagens da webcam. O resultado é guardado por imagem.
 */
export function classificarImagem(img: ImagemJogo): Promise<PrevisaoCNN> {
  const existente = cache.get(img.id)
  if (existente) return existente
  const p = (async () => {
    const inicio = performance.now()
    // A foto já está no servidor: mandamos só o id (antes o navegador baixava
    // a imagem e enviava de volta — trabalho dobrado).
    const form = new FormData()
    form.append('imagem_id', img.id)
    const r = await json<PrevisaoCNN>(await fetch('/api/classificar', { method: 'POST', body: form }))
    return { ...r, tempo_total_ms: performance.now() - inicio }
  })()
  cache.set(img.id, p)
  p.catch(() => cache.delete(img.id)) // permite tentar de novo
  return p
}

export interface RegistroPontuacao {
  jogo: 'desafio_piscar' | 'conexao_ecologica'
  pontos: number
  acertos: number
  erros: number
  acertos_cnn?: number
  total_cnn?: number
}

export async function salvarPontuacao(p: RegistroPontuacao): Promise<void> {
  try {
    await fetch('/api/pontuacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    })
  } catch {
    /* sem servidor: a partida continua válida */
  }
}

export function topProbabilidades(p: PrevisaoCNN, n = 3): [string, number][] {
  return Object.entries(p.probabilidades)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}
