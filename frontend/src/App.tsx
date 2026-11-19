import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Cenario } from './components/Cenario'
import { CameraProvider, useCamera } from './context/CameraContext'
import { ConfigProvider } from './context/ConfigContext'
import ComoJogar from './pages/ComoJogar'
import Configuracoes from './pages/Configuracoes'
import EscolhaJogo from './pages/EscolhaJogo'
import Inicio from './pages/Inicio'

// Os jogos carregam o MediaPipe; ficam em pacotes separados.
const BlinkQuiz = lazy(() => import('./games/BlinkQuiz/BlinkQuiz'))
const AirMatching = lazy(() => import('./games/AirMatching/AirMatching'))

function Rotas() {
  const local = useLocation()
  const { status, desligar } = useCamera()
  // Fora dos jogos a câmera é desligada (não fica decodificando vídeo à toa).
  useEffect(() => {
    if (!local.pathname.startsWith('/jogo') && status === 'ligada') desligar()
  }, [local.pathname, status, desligar])
  return (
    <div key={local.pathname} className="transicao-tela">
      <Suspense fallback={<p className="carregando">Carregando…</p>}>
        <Routes location={local}>
          <Route path="/" element={<Inicio />} />
          <Route path="/jogos" element={<EscolhaJogo />} />
          <Route path="/como-jogar" element={<ComoJogar />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/jogo/piscar" element={<BlinkQuiz />} />
          <Route path="/jogo/conexao" element={<AirMatching />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default function App() {
  return (
    <ConfigProvider>
      <CameraProvider>
        <BrowserRouter>
          <Cenario>
            <Rotas />
          </Cenario>
        </BrowserRouter>
      </CameraProvider>
    </ConfigProvider>
  )
}
