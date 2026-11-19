import { useNavigate } from 'react-router-dom'
import { Arvore, Gotinha, Robo } from '../components/Personagens'
import { Botao } from '../components/UI'
import { useConfig } from '../context/ConfigContext'

export default function Inicio() {
  const navigate = useNavigate()
  const { config, alterar } = useConfig()
  return (
    <div className="tela-centro inicio">
      <div className="logo" aria-label="EcoAventura — Missões da Reciclagem">
        <span className="logo-simbolo" aria-hidden>
          ♻
        </span>
        <h1>
          Eco<span>Aventura</span>
        </h1>
        <p>Missões da Reciclagem</p>
      </div>
      <div className="personagens-inicio">
        <Gotinha tamanho={110} className="flutua" />
        <Arvore tamanho={170} humor="animado" />
        <Robo tamanho={130} className="flutua flutua-2" />
      </div>
      <div className="menu-inicio">
        <Botao grande onClick={() => navigate('/jogos')} autoFocus icone="▶">
          Jogar
        </Botao>
        <Botao cor="azul" onClick={() => navigate('/como-jogar')} icone="?">
          Como jogar
        </Botao>
        <Botao cor="amarelo" onClick={() => navigate('/configuracoes')} icone="⚙">
          Configurações
        </Botao>
        <Botao cor="branco" onClick={() => alterar({ som: !config.som })} aria-pressed={config.som}>
          {config.som ? '🔊 Som ligado' : '🔇 Som desligado'}
        </Botao>
      </div>
    </div>
  )
}
