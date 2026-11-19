import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { obterHandLandmarker } from './mediapipe'
import type { EstadoRastreador } from './faceTracking'

export const PONTA_INDICADOR = 8
export const PONTA_POLEGAR = 4
const PUNHO = 0
const BASE_DEDO_MEDIO = 9
const BASE_INDICADOR = 5
const BASE_MINDINHO = 17

export interface QuadroMao {
  t: number
  detectado: boolean
  /** Ponta do indicador (landmark 8) em 0–1, JÁ ESPELHADA (como a criança vê). */
  indicador: { x: number; y: number }
  polegar: { x: number; y: number }
  /** Distância polegar–indicador dividida pelo tamanho observado da mão. */
  razaoPinca: number
}

const VAZIO: QuadroMao = { t: 0, detectado: false, indicador: { x: 0.5, y: 0.5 }, polegar: { x: 0.5, y: 0.5 }, razaoPinca: 1 }

function extrair(lm: HandLandmarker, video: HTMLVideoElement, t: number): QuadroMao {
  const r = lm.detectForVideo(video, t)
  const p = r.landmarks?.[0]
  if (!p) return { ...VAZIO, t }
  // Distâncias em pixels (corrige proporção 4:3 / 16:9 do vídeo)
  const w = video.videoWidth || 1
  const h = video.videoHeight || 1
  const dist = (a: number, b: number) => Math.hypot((p[a].x - p[b].x) * w, (p[a].y - p[b].y) * h)
  // Tamanho da mão: maior entre punho→base do dedo médio e largura da palma.
  // Usar duas medidas deixa a normalização estável quando a mão gira.
  const tamanho = Math.max(dist(PUNHO, BASE_DEDO_MEDIO), dist(BASE_INDICADOR, BASE_MINDINHO) * 1.25, 1)
  return {
    t,
    detectado: true,
    indicador: { x: 1 - p[PONTA_INDICADOR].x, y: p[PONTA_INDICADOR].y },
    polegar: { x: 1 - p[PONTA_POLEGAR].x, y: p[PONTA_POLEGAR].y },
    razaoPinca: dist(PONTA_POLEGAR, PONTA_INDICADOR) / tamanho,
  }
}

/**
 * Converte coordenadas da câmera (0–1, espelhadas) para pixels da tela.
 * Usa só a região central da câmera (margem) para a criança alcançar as
 * bordas da tela sem precisar esticar o braço até sair do quadro.
 */
export function cameraParaTela(x: number, y: number, margem = 0.15) {
  const u = Math.min(1, Math.max(0, (x - margem) / (1 - 2 * margem)))
  const v = Math.min(1, Math.max(0, (y - margem) / (1 - 2 * margem)))
  return { x: u * window.innerWidth, y: v * window.innerHeight }
}

export function useRastreamentoMao(
  video: HTMLVideoElement | null,
  ativo: boolean,
  aoQuadro: (q: QuadroMao) => void,
  fpsMax = 24,
) {
  const [estado, setEstado] = useState<EstadoRastreador>('carregando')
  const cb = useRef(aoQuadro)
  cb.current = aoQuadro
  const fps = useRef(20)
  fps.current = fpsMax

  useEffect(() => {
    if (!video || !ativo) return
    let parar = false
    let raf = 0
    let ultimo = -1
    let ultimaAnalise = 0
    obterHandLandmarker()
      .then((lm) => {
        if (parar) return
        setEstado('pronto')
        const passo = () => {
          if (parar) return
          const agora = performance.now()
          // Limita os quadros analisados (economiza CPU/GPU) e só processa quadros novos.
          if (video.readyState >= 2 && video.currentTime !== ultimo && agora - ultimaAnalise >= 1000 / fps.current - 4) {
            ultimo = video.currentTime
            ultimaAnalise = agora
            try {
              cb.current(extrair(lm, video, performance.now()))
            } catch {
              /* ignora quadro */
            }
          }
          raf = requestAnimationFrame(passo)
        }
        raf = requestAnimationFrame(passo)
      })
      .catch(() => setEstado('erro'))
    return () => {
      parar = true
      cancelAnimationFrame(raf)
    }
  }, [video, ativo])

  return estado
}
