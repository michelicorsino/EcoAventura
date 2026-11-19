import { useNavigate } from 'react-router-dom'
import { Gotinha, Robo } from '../components/Personagens'
import { Botao } from '../components/UI'

export default function EscolhaJogo() {
  const navigate = useNavigate()
  return (
    <div className="tela-centro">
      <h1 className="titulo-tela">Escolha sua missão</h1>
      <div className="paineis-jogos">
        <button className="painel-jogo painel-piscar" onClick={() => navigate('/jogo/piscar')} autoFocus>
          <Gotinha tamanho={120} humor="animado" />
          <h2>Desafio do Piscar</h2>
          <p>Olhe a foto do material e responda piscando os olhos!</p>
          <ul>
            <li>👁️ Uma piscada: olho esquerdo = A, direito = B</li>
            <li>👁️👁️ Duas piscadas: olho esquerdo = C, direito = D</li>
            <li>😌 Feche os dois olhos para confirmar · 10 perguntas</li>
          </ul>
          <span className="painel-cta">Jogar ▶</span>
        </button>
        <button className="painel-jogo painel-conexao" onClick={() => navigate('/jogo/conexao')}>
          <Robo tamanho={120} humor="animado" />
          <h2>Conexão Ecológica</h2>
          <p>Desenhe linhas no ar com o dedo e ligue cada material à sua categoria!</p>
          <ul>
            <li>☝️ O dedo indicador move a folhinha</li>
            <li>🤏 Junte o polegar e o indicador para puxar a linha</li>
            <li>🌳 5 rodadas para fazer a floresta crescer</li>
          </ul>
          <span className="painel-cta">Jogar ▶</span>
        </button>
      </div>
      <Botao cor="branco" onClick={() => navigate('/')}>
        ← Início
      </Botao>
    </div>
  )
}
