import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// Os arquivos WASM e os modelos .task são servidos localmente (public/mediapipe),
// então o processamento do vídeo acontece 100% no navegador.
const BASE = import.meta.env.BASE_URL + 'mediapipe/'

let fileset: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null
const obterFileset = () => (fileset ??= FilesetResolver.forVisionTasks(BASE + 'wasm'))

async function comFallbackGPU<T>(criar: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await criar('GPU')
  } catch {
    return await criar('CPU')
  }
}

let face: Promise<FaceLandmarker> | null = null
export function obterFaceLandmarker() {
  face ??= obterFileset().then((fs) =>
    comFallbackGPU((delegate) =>
      FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: BASE + 'models/face_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    ),
  )
  face.catch(() => (face = null))
  return face
}

let mao: Promise<HandLandmarker> | null = null
export function obterHandLandmarker() {
  mao ??= obterFileset().then((fs) =>
    comFallbackGPU((delegate) =>
      HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: BASE + 'models/hand_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    ),
  )
  mao.catch(() => (mao = null))
  return mao
}
