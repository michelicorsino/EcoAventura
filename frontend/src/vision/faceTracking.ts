import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { obterFaceLandmarker } from './mediapipe'

/**
 * Medidas extraídas de cada quadro. "canalA"/"canalB" são os blendshapes
 * eyeBlinkLeft/eyeBlinkRight do MediaPipe. Qual deles corresponde ao olho
 * esquerdo da criança é decidido na calibração (evita depender da convenção
 * de espelhamento do modelo).
 */
export interface QuadroFace {
  t: number
  detectado: boolean
  canalA: number
  canalB: number
  boca: number
  /** Giro horizontal (+ = para a direita da tela, já espelhado), em distâncias interoculares. */
  yaw: number
  /** Inclinação vertical (+ = para baixo). */
  pitch: number
}

const VAZIO: QuadroFace = { t: 0, detectado: false, canalA: 0, canalB: 0, boca: 0, yaw: 0, pitch: 0 }

function extrair(lm: FaceLandmarker, video: HTMLVideoElement, t: number): QuadroFace {
  const r = lm.detectForVideo(video, t)
  const pontos = r.faceLandmarks?.[0]
  const bs = r.faceBlendshapes?.[0]?.categories
  if (!pontos || !bs) return { ...VAZIO, t }
  const valor = (nome: string) => bs.find((c) => c.categoryName === nome)?.score ?? 0

  // Pose aproximada: ponta do nariz (1) vs. ponto médio dos cantos externos dos olhos (33, 263)
  const w = video.videoWidth || 1
  const h = video.videoHeight || 1
  const a = pontos[33]
  const b = pontos[263]
  const n = pontos[1]
  const mx = ((a.x + b.x) / 2) * w
  const my = ((a.y + b.y) / 2) * h
  const iod = Math.hypot((a.x - b.x) * w, (a.y - b.y) * h) || 1
  return {
    t,
    detectado: true,
    canalA: valor('eyeBlinkLeft'),
    canalB: valor('eyeBlinkRight'),
    boca: valor('jawOpen'),
    yaw: -((n.x * w - mx) / iod), // negativo: imagem exibida espelhada
    pitch: (n.y * h - my) / iod,
  }
}

export type EstadoRastreador = 'carregando' | 'pronto' | 'erro'

/**
 * Executa o Face Landmarker a cada novo quadro do vídeo e chama `aoQuadro`.
 * O vídeo nunca é gravado nem enviado.
 */
export function useRastreamentoFacial(
  video: HTMLVideoElement | null,
  ativo: boolean,
  aoQuadro: (q: QuadroFace) => void,
  fpsMax = 20,
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
    obterFaceLandmarker()
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
              /* quadro inválido: ignora */
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
