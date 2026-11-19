// Identificadores ORIGINAIS da CNN (mesma ordem de classes.json).
// A tradução é usada apenas na interface.
export const CLASSES = [
  'battery',
  'biological',
  'brown-glass',
  'cardboard',
  'clothes',
  'green-glass',
  'metal',
  'paper',
  'plastic',
  'shoes',
  'trash',
  'white-glass',
] as const

export type Classe = (typeof CLASSES)[number]

export interface InfoCategoria {
  nome: string
  emoji: string
  /** Cor do cartão na interface. */
  cor: string
  /** Lixeira/destino conforme cores da Resolução CONAMA 275/2001. */
  lixeira: string
  corLixeira: string
}

export const CATEGORIAS: Record<Classe, InfoCategoria> = {
  battery: { nome: 'Pilhas e baterias', emoji: '🔋', cor: '#ff9f43', lixeira: 'Ponto de coleta de pilhas', corLixeira: '#f57c00' },
  biological: { nome: 'Resíduos orgânicos', emoji: '🍎', cor: '#a1887f', lixeira: 'Lixeira marrom / composteira', corLixeira: '#795548' },
  'brown-glass': { nome: 'Vidro marrom', emoji: '🟤', cor: '#c49a6c', lixeira: 'Lixeira verde (vidro)', corLixeira: '#2e7d32' },
  cardboard: { nome: 'Papelão', emoji: '📦', cor: '#d7a86e', lixeira: 'Lixeira azul (papel)', corLixeira: '#1e88e5' },
  clothes: { nome: 'Roupas', emoji: '👕', cor: '#9fa8da', lixeira: 'Doação ou brechó', corLixeira: '#7e57c2' },
  'green-glass': { nome: 'Vidro verde', emoji: '🟢', cor: '#81c784', lixeira: 'Lixeira verde (vidro)', corLixeira: '#2e7d32' },
  metal: { nome: 'Metal', emoji: '🥫', cor: '#ffd54f', lixeira: 'Lixeira amarela (metal)', corLixeira: '#fbc02d' },
  paper: { nome: 'Papel', emoji: '📄', cor: '#90caf9', lixeira: 'Lixeira azul (papel)', corLixeira: '#1e88e5' },
  plastic: { nome: 'Plástico', emoji: '🧴', cor: '#ef9a9a', lixeira: 'Lixeira vermelha (plástico)', corLixeira: '#e53935' },
  shoes: { nome: 'Calçados', emoji: '👟', cor: '#bcaaa4', lixeira: 'Doação, conserto ou coleta', corLixeira: '#7e57c2' },
  trash: { nome: 'Lixo comum', emoji: '🗑️', cor: '#b0bec5', lixeira: 'Lixeira cinza (não reciclável)', corLixeira: '#757575' },
  'white-glass': { nome: 'Vidro transparente', emoji: '⚪', cor: '#b2ebf2', lixeira: 'Lixeira verde (vidro)', corLixeira: '#2e7d32' },
}

/**
 * Distratores preferidos: classes visualmente próximas ou que costumam
 * ser confundidas pelas crianças. Usados no Desafio do Piscar.
 */
export const PARECIDAS: Record<Classe, Classe[]> = {
  battery: ['metal', 'trash', 'plastic'],
  biological: ['trash', 'paper', 'cardboard'],
  'brown-glass': ['green-glass', 'white-glass', 'plastic'],
  cardboard: ['paper', 'trash', 'plastic'],
  clothes: ['shoes', 'trash', 'plastic'],
  'green-glass': ['brown-glass', 'white-glass', 'plastic'],
  metal: ['battery', 'plastic', 'trash'],
  paper: ['cardboard', 'trash', 'plastic'],
  plastic: ['white-glass', 'metal', 'trash'],
  shoes: ['clothes', 'trash', 'plastic'],
  trash: ['plastic', 'paper', 'biological'],
  'white-glass': ['plastic', 'green-glass', 'brown-glass'],
}

/** Grupos de semelhança visual — usados na dificuldade progressiva da Conexão Ecológica. */
export const GRUPOS_SEMELHANTES: Classe[][] = [
  ['brown-glass', 'green-glass', 'white-glass'],
  ['paper', 'cardboard'],
  ['plastic', 'metal', 'trash'],
  ['clothes', 'shoes'],
  ['battery'],
  ['biological'],
]

export const nomeClasse = (c: string) => CATEGORIAS[c as Classe]?.nome ?? c
