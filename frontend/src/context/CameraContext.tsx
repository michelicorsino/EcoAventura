import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type StatusCamera = 'desligada' | 'pedindo' | 'ligada' | 'erro'
export type ErroCamera = 'permissao_negada' | 'nao_encontrada' | 'em_uso' | 'sem_suporte' | 'desconhecido'

interface Valor {
  status: StatusCamera
  erro: ErroCamera | null
  /** Elemento <video> oculto compartilhado pelos rastreadores (MediaPipe). */
  video: HTMLVideoElement | null
  stream: MediaStream | null
  /** Brilho médio da imagem (0–255), medido localmente. */
  brilho: number | null
  ligar: () => Promise<boolean>
  desligar: () => void
}

const Ctx = createContext<Valor | null>(null)

export const MENSAGENS_ERRO_CAMERA: Record<ErroCamera, string> = {
  permissao_negada:
    'O navegador bloqueou a câmera. Peça para um adulto clicar no cadeado ao lado do endereço do site e liberar a câmera.',
  nao_encontrada: 'Não encontrei nenhuma câmera. Confira se ela está conectada.',
  em_uso: 'A câmera já está sendo usada por outro programa. Feche esse programa e tente de novo.',
  sem_suporte: 'Este navegador não deixa usar a câmera. Experimente o Chrome, o Edge ou o Firefox atualizados.',
  desconhecido: 'Não consegui ligar a câmera. Vamos tentar de novo?',
}

function classificarErro(e: unknown): ErroCamera {
  const nome = (e as DOMException)?.name
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'permissao_negada'
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'nao_encontrada'
  if (nome === 'NotReadableError' || nome === 'AbortError') return 'em_uso'
  return 'desconhecido'
}

export function CameraProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusCamera>('desligada')
  const [erro, setErro] = useState<ErroCamera | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [brilho, setBrilho] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)

  const ligar = useCallback(async () => {
    if (stream) return true
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro('sem_suporte')
      setStatus('erro')
      return false
    }
    setStatus('pedindo')
    setErro(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: 'user', frameRate: { ideal: 24, max: 30 } },
        audio: false,
      })
      const v = videoRef.current!
      v.srcObject = s
      await v.play()
      setStream(s)
      setVideo(v)
      setStatus('ligada')
      // Se a câmera for desconectada no meio do jogo
      s.getVideoTracks()[0]?.addEventListener('ended', () => {
        setStream(null)
        setStatus('erro')
        setErro('nao_encontrada')
      })
      return true
    } catch (e) {
      setErro(classificarErro(e))
      setStatus('erro')
      return false
    }
  }, [stream])

  const desligar = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setStream(null)
    setVideo(null)
    setStatus('desligada')
    setBrilho(null)
  }, [stream])

  // Mede a iluminação a cada 2 s numa miniatura 32x24 (nada sai do navegador).
  useEffect(() => {
    if (!stream || !video) return
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 24
    const c2d = canvas.getContext('2d', { willReadFrequently: true })
    const id = window.setInterval(() => {
      if (!c2d || video.readyState < 2) return
      c2d.drawImage(video, 0, 0, 32, 24)
      const d = c2d.getImageData(0, 0, 32, 24).data
      let soma = 0
      for (let i = 0; i < d.length; i += 4) soma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      setBrilho(soma / (d.length / 4))
    }, 2000)
    return () => window.clearInterval(id)
  }, [stream, video])

  return (
    <Ctx.Provider value={{ status, erro, video, stream, brilho, ligar, desligar }}>
      {children}
      {/* Fica fora da tela (não display:none, para o navegador continuar decodificando quadros). */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden
        style={{ position: 'fixed', left: -10, top: -10, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }}
      />
    </Ctx.Provider>
  )
}

export function useCamera() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCamera fora do CameraProvider')
  return v
}
