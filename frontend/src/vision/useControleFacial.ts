import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../context/CameraContext'
import { useConfig } from '../context/ConfigContext'
import { useRastreamentoFacial, type QuadroFace } from './faceTracking'
import {
  DetectorCabeca,
  DetectorBalancoCabeca,
  DetectorConfirmacao,
  DetectorPiscadas,
  descreverComando,
  DIRECOES_CABECA,
  opcaoDoComando,
  type GestoConfirmacao,
  type SaidaCabeca,
  type SaidaPiscadas,
} from './blinkDetection'

export interface ComandoFacial {
  opcao: 0 | 1 | 2 | 3
  descricao: string
}

export interface EstadoControleFacial {
  rastreador: 'carregando' | 'pronto' | 'erro'
  rostoVisivel: boolean
  /** Rosto sumiu há mais de 1,5 s (para mostrar aviso). */
  rostoAusente: boolean
  piscadas: SaidaPiscadas | null
  cabeca: SaidaCabeca | null
  /** 0–1 enquanto o gesto de confirmação está sendo segurado. */
  confirmacao: number
  /** Gesto efetivamente usado para confirmar (no modo "boca" é sempre "olhos"). */
  gestoConfirmacao: GestoConfirmacao
  /** Último gesto descartado (para explicar à criança por que não contou). */
  descartado: string | null
  calibrado: boolean
}

export const TEXTO_CONFIRMAR: Record<GestoConfirmacao, string> = {
  olhos: 'feche os dois olhos e conte até um',
  boca: 'abra bem a boca e conte até um',
}

/**
 * Une os modos de controle facial num fluxo em DOIS passos:
 *  1. `aoComando`  — escolher uma alternativa (piscadas ou cabeça);
 *  2. `aoConfirmar` — gesto deliberado e diferente (olhos fechados ou boca aberta, segurado);
 *  `aoVoltar` — balançar a cabeça dizendo "não" desfaz a escolha.
 * Enquanto `bloqueado` for true, nada é emitido e gestos pela metade são descartados.
 */
export function useControleFacial(
  ativo: boolean,
  bloqueado: boolean,
  aoComando: (c: ComandoFacial) => void,
  aoConfirmar?: () => void,
  aoVoltar?: () => void,
) {
  const { video } = useCamera()
  const { config, calibracoes } = useConfig()
  const modo = config.controleFacial
  // No modo "boca" a boca já escolhe a alternativa; a confirmação fica com os olhos.
  const gesto: GestoConfirmacao = modo === 'boca' ? 'olhos' : config.gestoConfirmacao
  const cbComando = useRef(aoComando)
  cbComando.current = aoComando
  const cbConfirmar = useRef(aoConfirmar)
  cbConfirmar.current = aoConfirmar
  const cbVoltar = useRef(aoVoltar)
  cbVoltar.current = aoVoltar
  const detectorVoltar = useMemo(() => new DetectorBalancoCabeca(0.09 / config.sensibilidadeCabeca), [config.sensibilidadeCabeca])
  const bloqueadoRef = useRef(bloqueado)

  const opcoesPiscadas = {
    janelaDuplaMs: config.janelaDuplaMs,
    cooldownMs: config.cooldownMs,
    preparoMs: config.preparoMs,
    duracaoMinMs: config.duracaoMinPiscadaMs,
  }
  const detectorPiscadas = useMemo(
    () => (calibracoes.olhos ? new DetectorPiscadas(calibracoes.olhos, opcoesPiscadas) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calibracoes.olhos],
  )
  useEffect(() => {
    detectorPiscadas?.setOpcoes(opcoesPiscadas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectorPiscadas, config.janelaDuplaMs, config.cooldownMs, config.preparoMs, config.duracaoMinPiscadaMs])

  const detectorCabeca = useMemo(
    () =>
      calibracoes.cabeca && modo !== 'piscadas'
        ? new DetectorCabeca(calibracoes.cabeca, modo, config.tempoPermanenciaMs, config.sensibilidadeCabeca)
        : null,
    [calibracoes.cabeca, modo, config.tempoPermanenciaMs, config.sensibilidadeCabeca],
  )

  const detectorConfirmacao = useMemo(
    () => new DetectorConfirmacao(gesto, config.duracaoConfirmacaoMs, calibracoes.olhos, calibracoes.cabeca),
    [gesto, config.duracaoConfirmacaoMs, calibracoes.olhos, calibracoes.cabeca],
  )

  // Ao bloquear/desbloquear, descarta gestos pela metade; ao liberar, exige novo preparo.
  useEffect(() => {
    bloqueadoRef.current = bloqueado
    detectorPiscadas?.reiniciar(bloqueado ? 0 : 400)
    detectorCabeca?.reiniciar(bloqueado ? 0 : 400)
    detectorConfirmacao.reiniciar(bloqueado ? 0 : 400)
    detectorVoltar.reiniciar(bloqueado ? 0 : 400)
  }, [bloqueado, detectorPiscadas, detectorCabeca, detectorConfirmacao, detectorVoltar])

  const [estado, setEstado] = useState<Omit<EstadoControleFacial, 'rastreador' | 'calibrado' | 'gestoConfirmacao'>>({
    rostoVisivel: false,
    rostoAusente: false,
    piscadas: null,
    cabeca: null,
    confirmacao: 0,
    descartado: null,
  })
  const ultimoRosto = useRef(performance.now())
  const ultimoDescarte = useRef<{ motivo: string; t: number } | null>(null)

  const assinatura = useRef('')
  const rastreador = useRastreamentoFacial(video, ativo, (q: QuadroFace) => {
    if (q.detectado) ultimoRosto.current = q.t
    let piscadas: SaidaPiscadas | null = null
    let cabeca: SaidaCabeca | null = null
    let comando: ComandoFacial | null = null
    const livre = !bloqueadoRef.current

    // A confirmação é avaliada primeiro: enquanto os olhos estão fechados de
    // propósito, o detector de piscadas vê um fechamento bilateral e o ignora.
    const conf = detectorConfirmacao.atualizar(q)
    const voltou = detectorVoltar.atualizar(q)

    if (modo === 'piscadas' && detectorPiscadas) {
      piscadas = detectorPiscadas.atualizar(q)
      if (piscadas.descartado && piscadas.descartado !== 'bloqueado') ultimoDescarte.current = { motivo: piscadas.descartado, t: q.t }
      if (piscadas.comando && livre) {
        comando = { opcao: opcaoDoComando(piscadas.comando), descricao: descreverComando(piscadas.comando) }
      }
    } else if (detectorCabeca) {
      cabeca = detectorCabeca.atualizar(q)
      if (cabeca.comando !== undefined && livre) {
        comando = {
          opcao: cabeca.comando,
          descricao: (modo === 'boca' ? 'cabeça + boca: ' : 'cabeça: ') + DIRECOES_CABECA[cabeca.comando],
        }
      }
    }
    const d = ultimoDescarte.current
    const novo = {
      rostoVisivel: q.detectado,
      rostoAusente: !q.detectado && q.t - ultimoRosto.current > 1500,
      piscadas,
      cabeca,
      confirmacao: livre ? conf.progresso : 0,
      descartado: d && q.t - d.t < 2500 ? d.motivo : null,
    }
    // Só re-renderiza o jogo quando algo VISÍVEL mudou (anéis arredondados a 5%).
    const r = (v: number | undefined) => (v === undefined ? '' : Math.round(v * 20))
    const chave = [
      novo.rostoVisivel, novo.rostoAusente, novo.descartado, r(novo.confirmacao),
      piscadas?.pronto, r(piscadas?.preparo), piscadas?.movendo, piscadas?.pendente?.olho, r(piscadas?.pendente?.fracao),
      cabeca?.quadrante, r(cabeca?.progresso),
    ].join('|')
    if (chave !== assinatura.current) {
      assinatura.current = chave
      setEstado(novo)
    }
    if (comando) cbComando.current(comando)
    if (conf.confirmou && livre) cbConfirmar.current?.()
    if (voltou && livre) cbVoltar.current?.()
  }, config.fpsVisao)

  const calibrado = modo === 'piscadas' ? !!calibracoes.olhos : !!calibracoes.cabeca
  return { ...estado, rastreador, calibrado, gestoConfirmacao: gesto } satisfies EstadoControleFacial
}
