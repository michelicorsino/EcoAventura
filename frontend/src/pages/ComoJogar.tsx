import { useNavigate } from 'react-router-dom'
import { Arvore } from '../components/Personagens'
import { Botao, IconeOlho } from '../components/UI'

export default function ComoJogar() {
  const navigate = useNavigate()
  return (
    <div className="tela-centro">
      <div className="cartao cartao-largo como-jogar">
        <div className="linha-personagem">
          <Arvore tamanho={100} />
          <div>
            <h1>Como jogar</h1>
            <p className="texto-grande">Nos dois jogos você usa a câmera no lugar do mouse.</p>
          </div>
        </div>

        <h2>👁️ Desafio do Piscar</h2>
        <div className="grade-instrucoes">
          <div className="instrucao-item">
            <span className="letra">A</span>
            <IconeOlho olho="esquerdo" vezes={1} /> 1 piscada do olho esquerdo
          </div>
          <div className="instrucao-item">
            <span className="letra">B</span>
            <IconeOlho olho="direito" vezes={1} /> 1 piscada do olho direito
          </div>
          <div className="instrucao-item">
            <span className="letra">C</span>
            <IconeOlho olho="esquerdo" vezes={2} /> 2 piscadas do olho esquerdo
          </div>
          <div className="instrucao-item">
            <span className="letra">D</span>
            <IconeOlho olho="direito" vezes={2} /> 2 piscadas do olho direito
          </div>
        </div>
        <p>
          A piscada só <strong>marca</strong> a resposta. Para <strong>confirmar</strong>, feche os dois olhos e conte até um. Marcou
          errado? Balance a cabeça dizendo “não” para desmarcar. Piscar normalmente, com os dois olhos, não atrapalha. Se for difícil
          piscar um olho de cada vez, nas Configurações dá para jogar <strong>apontando com a cabeça</strong>.
        </p>

        <h2>☝️ Conexão Ecológica</h2>
        <ol className="passos">
          <li>A folhinha na tela segue a ponta do seu dedo indicador.</li>
          <li>Em cima de uma foto, junte o polegar e o indicador (como uma pinça) para pegar a linha.</li>
          <li>Leve a linha até a categoria certa e abra os dedos para soltar.</li>
          <li>Se a pinça for difícil, escolha “segurar em cima” nas Configurações.</li>
        </ol>

        <h2>🤖 E o robô?</h2>
        <p>
          O robô é uma inteligência artificial que aprendeu a reconhecer 12 tipos de materiais olhando milhares de fotos. Depois de cada
          resposta, você vê o palpite dele. Às vezes ele também erra, e isso nunca tira os seus pontos!
        </p>

        <h2>🔒 Sua privacidade</h2>
        <p>A imagem da câmera fica só no computador e nada é gravado. O robô recebe apenas as fotos dos materiais do jogo.</p>

        <div className="linha-botoes">
          <Botao cor="branco" onClick={() => navigate('/')}>
            ← Início
          </Botao>
          <Botao onClick={() => navigate('/jogos')}>Jogar ▶</Botao>
        </div>
      </div>
    </div>
  )
}
