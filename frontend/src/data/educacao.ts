import dados from './educacao.json'

export interface TextoEducativo {
  dica: string
  destino: string
}

/** Mensagem educativa (revisada) para a classe original da CNN. */
export function textoEducativo(classe: string): TextoEducativo | null {
  const v = (dados as Record<string, unknown>)[classe]
  return v && typeof v === 'object' ? (v as TextoEducativo) : null
}
