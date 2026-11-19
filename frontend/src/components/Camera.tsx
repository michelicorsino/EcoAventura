import { useEffect, useRef } from 'react'
import { MENSAGENS_ERRO_CAMERA, useCamera } from '../context/CameraContext'
import { useConfig } from '../context/ConfigContext'
import { Gotinha, Robo } from './Personagens'
import { Botao } from './UI'

/** Pré-visualização espelhada da webcam (opcional). Só exibe; nada é gravado. */
export function PreviaCamera({ compacta = false, detectado }: { compacta?: boolean; detectado?: boolean }) {
  const { stream, desligar } = useCamera()
  const { config } = useConfig()
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
      void ref.current.play().catch(() => {})
    }
  }, [stream, config.mostrarCamera])

  if (!stream) return null
  return (
    <div className={`previa-camera ${compacta ? 'compacta' : ''}`}>
      {config.mostrarCamera ? (
        <video ref={ref} muted playsInline aria-label="Sua imagem na câmera (espelhada)" />
      ) : (
        <div className="previa-oculta">📷 Câmera ligada</div>
      )}
      {detectado !== undefined && (
        <span className={`chip ${detectado ? 'chip-ok' : 'chip-alerta'}`}>{detectado ? '● Estou vendo você' : '○ Procurando…'}</span>
      )}
      <button className="previa-parar" onClick={desligar} title="Desligar a câmera" data-mao-clicavel="">
        ⏹ Desligar câmera
      </button>
    </div>
  )
}

/** Avisos de iluminação e de ausência de rosto/mão. */
export function AvisosCamera({ ausente, oQue }: { ausente: boolean; oQue: 'rosto' | 'mão' }) {
  const { brilho } = useCamera()
  const escuro = brilho !== null && brilho < 45
  if (!ausente && !escuro) return null
  return (
    <div className="aviso-camera" role="status">
      {escuro && <p>💡 Está um pouco escuro. Acenda uma luz ou fique de frente para uma janela.</p>}
      {ausente && (
        <p>
          {oQue === 'rosto'
            ? '🙂 Não estou vendo o seu rosto. Fique de frente para a câmera.'
            : '✋ Não estou vendo a sua mão. Mostre a mão aberta para a câmera.'}
        </p>
      )}
    </div>
  )
}

/** Tela de autorização da câmera. */
export function AutorizacaoCamera({
  aoLiberar,
  aoVoltar,
  aoSemCamera,
  oQue,
}: {
  aoLiberar: () => void
  aoVoltar: () => void
  aoSemCamera?: () => void
  oQue: 'rosto' | 'mão'
}) {
  const { status, erro, ligar } = useCamera()
  useEffect(() => {
    if (status === 'ligada') aoLiberar()
  }, [status, aoLiberar])
  // Se a criança já deu permissão antes, liga a câmera direto.
  useEffect(() => {
    let cancelado = false
    navigator.permissions
      ?.query({ name: 'camera' as PermissionName })
      .then((p) => {
        if (!cancelado && p.state === 'granted') void ligar()
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="tela-centro">
      <div className="cartao cartao-largo">
        <div className="linha-personagem">
          <Robo tamanho={110} humor={status === 'erro' ? 'triste' : 'feliz'} />
          <div>
            <h2>Vamos usar a câmera?</h2>
            <p>
              Neste jogo você joga com {oQue === 'rosto' ? 'os olhos e o rosto' : 'as mãos'}, sem precisar do mouse. A câmera
              serve só para enxergar os seus movimentos.
            </p>
          </div>
        </div>
        <ul className="lista-privacidade">
          <li>🔒 A imagem da câmera fica só neste computador: nada é gravado nem enviado para a internet.</li>
          <li>🖼️ O robô só recebe as fotos dos materiais que aparecem no jogo.</li>
          <li>⏹ Você pode desligar a câmera quando quiser.</li>
        </ul>
        {status === 'erro' && erro && (
          <div className="alerta" role="alert">
            <Gotinha tamanho={56} humor="triste" />
            <p>{MENSAGENS_ERRO_CAMERA[erro]}</p>
          </div>
        )}
        <div className="linha-botoes">
          <Botao cor="branco" onClick={aoVoltar}>
            ← Voltar
          </Botao>
          {aoSemCamera && (
            <Botao cor="azul" onClick={aoSemCamera}>
              Jogar sem câmera
            </Botao>
          )}
          <Botao grande onClick={() => void ligar()} disabled={status === 'pedindo'} autoFocus>
            {status === 'pedindo' ? 'Esperando a permissão…' : status === 'erro' ? 'Tentar de novo' : '📷 Ligar câmera'}
          </Botao>
        </div>
        <p className="nota">
          Se o navegador perguntar, peça para um adulto clicar em “Permitir”. Também dá para jogar sem câmera, usando o teclado, o mouse ou o toque na tela.
        </p>
      </div>
    </div>
  )
}
