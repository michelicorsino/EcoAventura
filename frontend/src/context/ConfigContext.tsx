import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import padrao from '../config/configuracoes.json'
import { definirSomAtivo } from '../services/som'
import type { CalibracaoOlhos, CalibracaoCabeca, GestoConfirmacao } from '../vision/blinkDetection'
import type { CalibracaoPinca } from '../vision/pinchDetection'

export type ControleFacial = 'piscadas' | 'cabeca' | 'boca'
export type ControleMao = 'pinca' | 'permanencia'

export interface Configuracoes {
  som: boolean
  modoDemonstracao: boolean
  mostrarCamera: boolean
  controleFacial: ControleFacial
  janelaDuplaMs: number
  cooldownMs: number
  /** Olhos abertos e cabeça parada por este tempo antes de aceitar um gesto. */
  preparoMs: number
  duracaoMinPiscadaMs: number
  /** Gesto que confirma a alternativa escolhida. */
  gestoConfirmacao: GestoConfirmacao
  duracaoConfirmacaoMs: number
  sensibilidadeCabeca: number
  controleMao: ControleMao
  tempoPermanenciaMs: number
  suavizacaoCursor: number
  avancoAutomaticoMs: number
  /** Quadros por segundo analisados pelo MediaPipe (menos = PC mais leve). */
  fpsVisao: number
}

export interface Calibracoes {
  olhos?: CalibracaoOlhos
  cabeca?: CalibracaoCabeca
  pinca?: CalibracaoPinca
}

interface Valor {
  config: Configuracoes
  alterar: (p: Partial<Configuracoes>) => void
  restaurar: () => void
  /** Calibrações ficam só na memória da sessão (nada biométrico é salvo). */
  calibracoes: Calibracoes
  setCalibracoes: (p: Partial<Calibracoes>) => void
}

const CHAVE = 'ecoaventura.config.v1'
const Ctx = createContext<Valor | null>(null)

function carregar(): Configuracoes {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo) return { ...(padrao as Configuracoes), ...JSON.parse(salvo) }
  } catch {
    /* armazenamento indisponível */
  }
  return padrao as Configuracoes
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Configuracoes>(carregar)
  const [calibracoes, setCal] = useState<Calibracoes>({})

  useEffect(() => {
    definirSomAtivo(config.som)
    try {
      localStorage.setItem(CHAVE, JSON.stringify(config))
    } catch {
      /* ok */
    }
  }, [config])

  return (
    <Ctx.Provider
      value={{
        config,
        alterar: (p) => setConfig((c) => ({ ...c, ...p })),
        restaurar: () => setConfig(padrao as Configuracoes),
        calibracoes,
        setCalibracoes: (p) => setCal((c) => ({ ...c, ...p })),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useConfig() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConfig fora do ConfigProvider')
  return v
}
