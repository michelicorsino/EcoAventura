import type { QuadroFace } from './faceTracking'

/* ============================================================================
 * Piscadas voluntárias
 * ----------------------------------------------------------------------------
 * 1. Cada olho é normalizado com limiares INDIVIDUAIS da calibração:
 *      n = (valor - aberto) / (fechado - aberto)   (0 = aberto, 1 = fechado)
 * 2. Um "episódio" começa quando algum olho passa de FECHA e só termina
 *    quando os dois reabrem (abaixo de REABRE) — fechamento + reabertura.
 * 3. O episódio vira piscada de UM olho se, na maior parte dos quadros, só
 *    aquele olho estava fechado. Piscadas dos dois olhos são ignoradas.
 * 4. Agregador: uma piscada fica "pendente" durante a janela (≈900 ms).
 *    Se vier outra do mesmo olho → comando duplo. Se a janela acabar → simples.
 * ==========================================================================*/

export type Olho = 'esquerdo' | 'direito'

export interface CalibracaoOlhos {
  /** Qual blendshape corresponde ao olho ESQUERDO da criança. */
  canalEsquerdo: 'A' | 'B'
  aberto: { esq: number; dir: number }
  fechado: { esq: number; dir: number }
  /** Quanto o olho oposto fecha junto (normalizado 0–1) ao piscar cada olho. */
  vazamento: { esq: number; dir: number }
  confiabilidade: 'alta' | 'baixa'
  motivos: string[]
}

export const FECHA = 0.65
export const REABRE = 0.35
/** Piscadas voluntárias duram ~200–400 ms; fechamentos mais curtos são ruído ou reflexo. */
const DURACAO_MIN_PADRAO_MS = 150
const DURACAO_MAX_MS = 1500
/** Cabeça mexendo mais rápido que isto (distâncias interoculares/s) invalida o gesto. */
const VELOCIDADE_CABECA_MAX = 0.9

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function niveis(q: QuadroFace, c: CalibracaoOlhos) {
  const esqRaw = c.canalEsquerdo === 'A' ? q.canalA : q.canalB
  const dirRaw = c.canalEsquerdo === 'A' ? q.canalB : q.canalA
  return {
    esq: clamp01((esqRaw - c.aberto.esq) / Math.max(0.05, c.fechado.esq - c.aberto.esq)),
    dir: clamp01((dirRaw - c.aberto.dir) / Math.max(0.05, c.fechado.dir - c.aberto.dir)),
  }
}

/* --------------------------------------------------------- calibração --- */

const mediana = (v: number[]) => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const percentil = (v: number[], p: number) => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

export interface AmostraOlhos {
  a: number
  b: number
}

/**
 * Monta a calibração a partir de três coletas: olhos abertos, só o esquerdo
 * fechado e só o direito fechado. Retorna null se as coletas forem incoerentes.
 */
export function montarCalibracaoOlhos(
  abertos: AmostraOlhos[],
  esqFechado: AmostraOlhos[],
  dirFechado: AmostraOlhos[],
): CalibracaoOlhos | null {
  if (abertos.length < 5 || esqFechado.length < 3 || dirFechado.length < 3) return null
  const a0 = mediana(abertos.map((s) => s.a))
  const b0 = mediana(abertos.map((s) => s.b))
  const eA = percentil(esqFechado.map((s) => s.a), 0.7)
  const eB = percentil(esqFechado.map((s) => s.b), 0.7)
  const dA = percentil(dirFechado.map((s) => s.a), 0.7)
  const dB = percentil(dirFechado.map((s) => s.b), 0.7)

  // Ao fechar o olho esquerdo, o canal que mais sobe é o "esquerdo".
  const canalEsquerdo: 'A' | 'B' = eA - a0 >= eB - b0 ? 'A' : 'B'
  const canalDireitoNoDir = dA - a0 >= dB - b0 ? 'A' : 'B'
  if (canalEsquerdo === canalDireitoNoDir) return null // incoerente: o mesmo canal subiu nas duas coletas

  const abertoEsq = canalEsquerdo === 'A' ? a0 : b0
  const abertoDir = canalEsquerdo === 'A' ? b0 : a0
  const fechadoEsq = canalEsquerdo === 'A' ? eA : eB
  const fechadoDir = canalEsquerdo === 'A' ? dB : dA
  const dirDuranteEsq = canalEsquerdo === 'A' ? eB : eA
  const esqDuranteDir = canalEsquerdo === 'A' ? dA : dB
  const vazEsq = clamp01((dirDuranteEsq - abertoDir) / Math.max(0.05, fechadoDir - abertoDir))
  const vazDir = clamp01((esqDuranteDir - abertoEsq) / Math.max(0.05, fechadoEsq - abertoEsq))

  const motivos: string[] = []
  if (fechadoEsq - abertoEsq < 0.25) motivos.push('olho esquerdo com pouca diferença entre aberto e fechado')
  if (fechadoDir - abertoDir < 0.25) motivos.push('olho direito com pouca diferença entre aberto e fechado')
  if (vazEsq > 0.5) motivos.push('o olho direito fecha junto ao piscar o esquerdo')
  if (vazDir > 0.5) motivos.push('o olho esquerdo fecha junto ao piscar o direito')

  return {
    canalEsquerdo,
    aberto: { esq: abertoEsq, dir: abertoDir },
    fechado: { esq: fechadoEsq, dir: fechadoDir },
    vazamento: { esq: vazEsq, dir: vazDir },
    confiabilidade: motivos.length ? 'baixa' : 'alta',
    motivos,
  }
}

/* ----------------------------------------------------------- detector --- */

export interface ComandoPiscada {
  olho: Olho
  vezes: 1 | 2
  t: number
}

export interface SaidaPiscadas {
  esq: number
  dir: number
  fechando: boolean
  /** A criança está "pronta": olhos abertos e cabeça parada pelo tempo de preparo. */
  pronto: boolean
  /** 0–1: quanto já passou do preparo (olhos abertos e cabeça parada). */
  preparo: number
  /** Cabeça se mexendo rápido (gestos são ignorados). */
  movendo: boolean
  /** Piscada aguardando a janela da segunda. */
  pendente: { olho: Olho; restanteMs: number; fracao: number } | null
  /** Piscada individual detectada neste quadro (fechou e reabriu). */
  piscada?: Olho
  /** Fechamento dos dois olhos (ignorado como comando). */
  bilateral?: boolean
  /** Fechamento descartado (curto demais, cabeça mexendo, criança não estava pronta…). */
  descartado?: string
  comando?: ComandoPiscada
}

export interface OpcoesPiscadas {
  janelaDuplaMs: number
  cooldownMs: number
  /** Tempo com os olhos abertos e a cabeça parada antes de aceitar um novo gesto. */
  preparoMs?: number
  /** Duração mínima de uma piscada voluntária. */
  duracaoMinMs?: number
}

interface Episodio {
  inicio: number
  esq: number
  dir: number
  ambos: number
  total: number
  invalido: string | null
}

export class DetectorPiscadas {
  private cal: CalibracaoOlhos
  private opc: Required<OpcoesPiscadas>
  private episodio: Episodio | null = null
  private pendente: { olho: Olho; t: number } | null = null
  private bloqueadoAte = 0
  private ultimoT = 0
  private difMin: { esq: number; dir: number }
  /** Desde quando os olhos estão abertos e a cabeça parada (null = não está). */
  private estavelDesde: number | null = null
  private anterior: { t: number; yaw: number; pitch: number } | null = null
  private velocidade = 0

  constructor(cal: CalibracaoOlhos, opc: OpcoesPiscadas) {
    this.cal = cal
    this.opc = { preparoMs: 800, duracaoMinMs: DURACAO_MIN_PADRAO_MS, ...opc }
    // Exige que o olho ativo esteja bem mais fechado que o outro,
    // considerando o "vazamento" medido na calibração.
    this.difMin = {
      esq: Math.min(0.4, Math.max(0.25, (1 - cal.vazamento.esq) / 2)),
      dir: Math.min(0.4, Math.max(0.25, (1 - cal.vazamento.dir) / 2)),
    }
  }

  setOpcoes(o: Partial<OpcoesPiscadas>) {
    this.opc = { ...this.opc, ...o } as Required<OpcoesPiscadas>
  }

  /**
   * Descarta episódio e piscada pendente (rosto sumiu, feedback na tela,
   * nova pergunta). Depois disso a criança precisa ficar de olhos abertos e
   * cabeça parada pelo tempo de preparo antes de um novo gesto valer.
   */
  reiniciar(bloquearPorMs = 0) {
    this.episodio = null
    this.pendente = null
    this.estavelDesde = null
    // Mesma base de tempo dos quadros (timestamp do último quadro recebido)
    this.bloqueadoAte = Math.max(this.bloqueadoAte, this.ultimoT + bloquearPorMs)
  }

  atualizar(q: QuadroFace): SaidaPiscadas {
    const t = q.t
    this.ultimoT = t
    if (!q.detectado) {
      this.reiniciar()
      this.anterior = null
      return { esq: 0, dir: 0, fechando: false, pronto: false, preparo: 0, movendo: false, pendente: null }
    }

    // ---- velocidade da cabeça (média móvel), para ignorar gestos durante movimentos
    if (this.anterior) {
      const dt = Math.max(1, t - this.anterior.t) / 1000
      const v = Math.hypot(q.yaw - this.anterior.yaw, q.pitch - this.anterior.pitch) / dt
      this.velocidade = 0.6 * this.velocidade + 0.4 * v
    }
    this.anterior = { t, yaw: q.yaw, pitch: q.pitch }
    const movendo = this.velocidade > VELOCIDADE_CABECA_MAX

    const { esq, dir } = niveis(q, this.cal)
    const abertos = esq < REABRE && dir < REABRE

    // ---- preparo: olhos abertos + cabeça parada + fora do bloqueio
    // (com os olhos fechando, o preparo fica "congelado": o episódio decide se valeu)
    if (abertos && !movendo && t >= this.bloqueadoAte) this.estavelDesde ??= t
    else if (abertos && !this.pendente) this.estavelDesde = null
    const preparo = this.estavelDesde === null ? 0 : Math.min(1, (t - this.estavelDesde) / this.opc.preparoMs)
    const pronto = preparo >= 1

    const saida: SaidaPiscadas = { esq, dir, fechando: false, pronto, preparo, movendo, pendente: null }

    // ---- episódio de fechamento
    if (!this.episodio && Math.max(esq, dir) >= FECHA) {
      this.episodio = {
        inicio: t,
        esq: 0,
        dir: 0,
        ambos: 0,
        total: 0,
        // Um novo gesto só vale se a criança estava pronta (ou se é a 2ª piscada de uma dupla)
        invalido: t < this.bloqueadoAte ? 'bloqueado' : pronto || this.pendente ? null : 'cedo demais',
      }
    }
    if (this.episodio) {
      const e = this.episodio
      if (movendo) e.invalido ??= 'a cabeça estava se mexendo'
      if (esq >= FECHA && esq - dir >= this.difMin.esq) e.esq++
      else if (dir >= FECHA && dir - esq >= this.difMin.dir) e.dir++
      else if (esq >= FECHA && dir >= FECHA) e.ambos++
      e.total++
      saida.fechando = true

      if (abertos) {
        // reabriu: avalia o episódio
        this.episodio = null
        saida.fechando = false
        const dur = t - e.inicio
        const fechadoTotal = e.esq + e.dir + e.ambos
        if (e.invalido) saida.descartado = e.invalido
        else if (dur < this.opc.duracaoMinMs) saida.descartado = 'piscada rápida demais'
        else if (dur > DURACAO_MAX_MS) saida.descartado = 'olho fechado por muito tempo'
        // 75% dos quadros com SÓ aquele olho fechado
        else if (fechadoTotal > 0 && e.esq / fechadoTotal >= 0.75) saida.piscada = 'esquerdo'
        else if (fechadoTotal > 0 && e.dir / fechadoTotal >= 0.75) saida.piscada = 'direito'
        else saida.bilateral = true
        if (!saida.piscada) {
          // gesto inválido no meio de uma dupla cancela a piscada pendente
          if (saida.descartado && this.pendente) this.pendente = null
          this.estavelDesde = null
        }
      }
    }

    // ---- agregação simples/dupla
    if (saida.piscada) {
      const p = this.pendente
      if (p && p.olho === saida.piscada && t - p.t <= this.opc.janelaDuplaMs) {
        saida.comando = { olho: p.olho, vezes: 2, t }
        this.pendente = null
      } else {
        // olho diferente dentro da janela: vale a última piscada
        this.pendente = { olho: saida.piscada, t }
      }
    }
    // Piscada dos dois olhos (saida.bilateral) é ignorada: não cancela nem confirma.

    if (this.pendente && !this.episodio && t - this.pendente.t > this.opc.janelaDuplaMs) {
      saida.comando = { olho: this.pendente.olho, vezes: 1, t }
      this.pendente = null
    }
    if (saida.comando) {
      // depois de cada comando: intervalo de proteção + novo preparo
      this.bloqueadoAte = t + this.opc.cooldownMs
      this.estavelDesde = null
      saida.pronto = false
      saida.preparo = 0
    }
    if (this.pendente) {
      const restante = Math.max(0, this.opc.janelaDuplaMs - (t - this.pendente.t))
      saida.pendente = { olho: this.pendente.olho, restanteMs: restante, fracao: restante / this.opc.janelaDuplaMs }
    }
    return saida
  }
}

/* ============================================================================
 * Gesto de CONFIRMAÇÃO
 * A piscada só ESCOLHE a alternativa; para registrar a resposta a criança
 * faz um gesto diferente e deliberado, segurado por ~1 s:
 *  - "olhos": fechar os DOIS olhos e segurar (piscadas naturais duram ~0,15 s);
 *  - "boca": abrir bem a boca e segurar.
 * Depois de confirmar é preciso soltar (abrir os olhos / fechar a boca).
 * ==========================================================================*/

export type GestoConfirmacao = 'olhos' | 'boca'

export interface SaidaConfirmacao {
  /** 0–1 enquanto o gesto está sendo segurado. */
  progresso: number
  confirmou: boolean
}

export class DetectorConfirmacao {
  gesto: GestoConfirmacao
  duracaoMs: number
  private calOlhos?: CalibracaoOlhos
  private calCabeca?: CalibracaoCabeca
  private desde: number | null = null
  /** false até o gesto ser "solto" (evita confirmar com um gesto que já vinha acontecendo). */
  private armado = false
  private soltoQuadros = 0
  private bloqueadoAte = 0
  private ultimoT = 0

  constructor(gesto: GestoConfirmacao, duracaoMs: number, calOlhos?: CalibracaoOlhos, calCabeca?: CalibracaoCabeca) {
    this.gesto = gesto
    this.duracaoMs = duracaoMs
    this.calOlhos = calOlhos
    this.calCabeca = calCabeca
  }

  reiniciar(bloquearPorMs = 0) {
    this.desde = null
    this.armado = false
    this.soltoQuadros = 0
    this.bloqueadoAte = this.ultimoT + bloquearPorMs
  }

  /** O gesto de confirmação está acontecendo neste quadro? */
  ativo(q: QuadroFace): boolean {
    if (this.gesto === 'olhos') {
      if (this.calOlhos) {
        const n = niveis(q, this.calOlhos)
        return n.esq >= FECHA && n.dir >= FECHA
      }
      return q.canalA > 0.5 && q.canalB > 0.5
    }
    const c = this.calCabeca
    const limiar = c ? c.boca0 + 0.5 * Math.max(0.15, c.bocaAberta - c.boca0) : 0.4
    return q.boca > limiar
  }

  atualizar(q: QuadroFace): SaidaConfirmacao {
    this.ultimoT = q.t
    const ativo = q.detectado && this.ativo(q)
    if (!ativo) {
      this.desde = null
      // precisa de alguns quadros "soltos" seguidos para rearmar
      if (q.detectado && ++this.soltoQuadros >= 3) this.armado = true
      return { progresso: 0, confirmou: false }
    }
    this.soltoQuadros = 0
    if (!this.armado || q.t < this.bloqueadoAte) return { progresso: 0, confirmou: false }
    this.desde ??= q.t
    const progresso = Math.min(1, (q.t - this.desde) / this.duracaoMs)
    if (progresso >= 1) {
      this.armado = false
      this.desde = null
      return { progresso: 1, confirmou: true }
    }
    return { progresso, confirmou: false }
  }
}

/** Mapeamento oficial do Desafio do Piscar. */
export function opcaoDoComando(c: ComandoPiscada): 0 | 1 | 2 | 3 {
  if (c.olho === 'esquerdo') return c.vezes === 1 ? 0 : 2
  return c.vezes === 1 ? 1 : 3
}

export function descreverComando(c: ComandoPiscada) {
  return `${c.vezes === 1 ? '1 piscada' : '2 piscadas'} do olho ${c.olho}`
}

/* ============================================================================
 * Modo alternativo: cabeça (permanência) ou cabeça + boca
 * A criança "aponta" um canto com a cabeça (A ↖, B ↗, C ↙, D ↘).
 *  - modo "cabeca": segura a posição pelo tempo de permanência.
 *  - modo "boca": aponta e abre a boca para confirmar.
 * Depois de cada comando é preciso voltar ao centro.
 * ==========================================================================*/

export interface CalibracaoCabeca {
  yaw0: number
  pitch0: number
  boca0: number
  bocaAberta: number
}

export function montarCalibracaoCabeca(neutro: QuadroFace[], bocaAberta: QuadroFace[]): CalibracaoCabeca | null {
  if (neutro.length < 5) return null
  const boca0 = mediana(neutro.map((q) => q.boca))
  return {
    yaw0: mediana(neutro.map((q) => q.yaw)),
    pitch0: mediana(neutro.map((q) => q.pitch)),
    boca0,
    bocaAberta: bocaAberta.length ? percentil(bocaAberta.map((q) => q.boca), 0.7) : Math.max(0.5, boca0 + 0.4),
  }
}

export interface SaidaCabeca {
  quadrante: 0 | 1 | 2 | 3 | null
  dx: number
  dy: number
  progresso: number
  bocaAberta: boolean
  comando?: 0 | 1 | 2 | 3
}

export class DetectorCabeca {
  private cal: CalibracaoCabeca
  modo: 'cabeca' | 'boca'
  permanenciaMs: number
  sensibilidade: number
  private atual: 0 | 1 | 2 | 3 | null = null
  private desde = 0
  private precisaCentro = false
  private bocaEstavaAberta = false
  private bloqueadoAte = 0
  private ultimoT = 0

  constructor(cal: CalibracaoCabeca, modo: 'cabeca' | 'boca', permanenciaMs: number, sensibilidade = 1) {
    this.cal = cal
    this.modo = modo
    this.permanenciaMs = permanenciaMs
    this.sensibilidade = sensibilidade
  }

  reiniciar(bloquearPorMs = 0) {
    this.atual = null
    this.precisaCentro = true
    this.bloqueadoAte = this.ultimoT + bloquearPorMs
  }

  atualizar(q: QuadroFace): SaidaCabeca {
    this.ultimoT = q.t
    if (!q.detectado) {
      this.atual = null
      return { quadrante: null, dx: 0, dy: 0, progresso: 0, bocaAberta: false }
    }
    const dx = q.yaw - this.cal.yaw0
    const dy = q.pitch - this.cal.pitch0
    const thX = 0.12 / this.sensibilidade
    const thY = 0.07 / this.sensibilidade
    const fator = this.atual === null ? 1 : 0.6 // histerese
    const fora = Math.abs(dx) > thX * fator && Math.abs(dy) > thY * fator
    const quad: 0 | 1 | 2 | 3 | null = fora ? (((dy > 0 ? 2 : 0) + (dx > 0 ? 1 : 0)) as 0 | 1 | 2 | 3) : null
    const limBoca = this.cal.boca0 + 0.5 * Math.max(0.15, this.cal.bocaAberta - this.cal.boca0)
    const bocaAberta = q.boca > limBoca

    if (quad === null && Math.abs(dx) < thX * 0.6 && Math.abs(dy) < thY * 0.6) this.precisaCentro = false
    if (quad !== this.atual) {
      this.atual = quad
      this.desde = q.t
    }
    const saida: SaidaCabeca = { quadrante: this.precisaCentro ? null : quad, dx, dy, progresso: 0, bocaAberta }
    if (this.precisaCentro || quad === null || q.t < this.bloqueadoAte) {
      this.bocaEstavaAberta = bocaAberta
      return saida
    }

    if (this.modo === 'cabeca') {
      saida.progresso = Math.min(1, (q.t - this.desde) / this.permanenciaMs)
      if (saida.progresso >= 1) saida.comando = quad
    } else {
      saida.progresso = bocaAberta ? 1 : 0
      if (bocaAberta && !this.bocaEstavaAberta) saida.comando = quad
    }
    this.bocaEstavaAberta = bocaAberta
    if (saida.comando !== undefined) {
      this.precisaCentro = true
      this.atual = null
    }
    return saida
  }
}

export const DIRECOES_CABECA = ['↖ cima e esquerda', '↗ cima e direita', '↙ baixo e esquerda', '↘ baixo e direita']

/* ============================================================================
 * Gesto de VOLTAR (desfazer a escolha): balançar a cabeça dizendo "não".
 * Conta as viradas de lado do giro horizontal (yaw). Ir para um lado, voltar
 * e ir de novo (3 movimentos com amplitude mínima) em até 1,6 s = "não".
 * Não conflita com as piscadas (o detector de piscadas ignora a cabeça em
 * movimento) nem com o modo cabeça (que exige segurar parado).
 * ==========================================================================*/

export class DetectorBalancoCabeca {
  /** Amplitude mínima de cada movimento, em distâncias interoculares. */
  amplitude: number
  janelaMs: number
  private dir: -1 | 0 | 1 = 0
  private extremo = 0
  private min = Infinity
  private max = -Infinity
  private movimentos: number[] = []
  private bloqueadoAte = 0
  private ultimoT = 0

  constructor(amplitude = 0.09, janelaMs = 1600) {
    this.amplitude = amplitude
    this.janelaMs = janelaMs
  }

  reiniciar(bloquearPorMs = 0) {
    this.dir = 0
    this.min = Infinity
    this.max = -Infinity
    this.movimentos = []
    this.bloqueadoAte = Math.max(this.bloqueadoAte, this.ultimoT + bloquearPorMs)
  }

  /** Retorna true no quadro em que o "não" com a cabeça é reconhecido. */
  atualizar(q: QuadroFace): boolean {
    this.ultimoT = q.t
    if (!q.detectado) {
      this.reiniciar()
      return false
    }
    const y = q.yaw
    this.movimentos = this.movimentos.filter((t) => q.t - t <= this.janelaMs)
    // muito tempo sem novo movimento: recomeça (deriva lenta não acumula)
    if (this.dir !== 0 && this.movimentos.length === 0) this.reiniciar()

    if (this.dir === 0) {
      this.min = Math.min(this.min, y)
      this.max = Math.max(this.max, y)
      if (y - this.min > this.amplitude) {
        this.dir = 1
        this.extremo = y
        this.movimentos.push(q.t)
      } else if (this.max - y > this.amplitude) {
        this.dir = -1
        this.extremo = y
        this.movimentos.push(q.t)
      }
    } else if (this.dir === 1) {
      if (y > this.extremo) this.extremo = y
      else if (this.extremo - y > this.amplitude * 1.5) {
        this.dir = -1
        this.extremo = y
        this.movimentos.push(q.t)
      }
    } else {
      if (y < this.extremo) this.extremo = y
      else if (y - this.extremo > this.amplitude * 1.5) {
        this.dir = 1
        this.extremo = y
        this.movimentos.push(q.t)
      }
    }

    if (this.movimentos.length >= 3) {
      const valeu = q.t >= this.bloqueadoAte
      this.reiniciar(800)
      return valeu
    }
    return false
  }
}
