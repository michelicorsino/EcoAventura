import { useEffect, useState, type ReactNode } from 'react'
import { useConfig } from '../context/ConfigContext'
import { som } from '../services/som'
import { Arvore, Gotinha, Robo } from './Personagens'
import { Confetes } from './UI'

export interface ResumoPartida {
  pontos: number
  maximo: number
  acertos: number
  erros: number
  acertosCnn: number
  totalCnn: number
  tempoMedioCnnMs?: number
}

export function medalha(pontos: number, maximo: number) {
  const f = maximo ? pontos / maximo : 0
  if (f >= 0.85) return { emoji: '🥇', nome: 'Medalha de Ouro', texto: 'Você é um guardião do planeta!' }
  if (f >= 0.6) return { emoji: '🥈', nome: 'Medalha de Prata', texto: 'Muito bem! A natureza agradece!' }
  if (f >= 0.3) return { emoji: '🥉', nome: 'Medalha de Bronze', texto: 'Bom trabalho! Cada acerto faz diferença.' }
  return { emoji: '🌱', nome: 'Sementinha', texto: 'Você plantou a primeira semente. Que tal jogar de novo?' }
}

/** Tela de resultado final (comum aos dois jogos). Os botões vêm do jogo. */
export function TelaResultado({ resumo, titulo, acoes, dica }: { resumo: ResumoPartida; titulo: string; acoes: ReactNode; dica?: ReactNode }) {
  const { config } = useConfig()
  const m = medalha(resumo.pontos, resumo.maximo)
  const [disparo, setDisparo] = useState(0)
  useEffect(() => {
    som.vitoria()
    setDisparo(Date.now())
  }, [])
  return (
    <div className="tela-centro">
      <Confetes disparo={disparo} />
      <div className="cartao cartao-largo resultado">
        <p className="etapa-rotulo">{titulo}</p>
        <div className="medalha" aria-label={m.nome}>
          {m.emoji}
        </div>
        <h2>{m.nome}</h2>
        <p className="texto-grande">{m.texto}</p>
        <div className="placar-final">
          <div>
            <strong>{resumo.pontos}</strong>
            <span>pontos</span>
          </div>
          <div>
            <strong>{resumo.acertos}</strong>
            <span>acertos</span>
          </div>
          <div>
            <strong>{resumo.erros}</strong>
            <span>erros</span>
          </div>
        </div>
        <div className="linha-personagem resultado-personagens">
          <Arvore tamanho={90} humor="animado" />
          <Gotinha tamanho={70} humor="feliz" />
          <Robo tamanho={80} humor="feliz" />
        </div>
        {resumo.totalCnn > 0 && (
          <p className="nota">
            🤖 O robô acertou {resumo.acertosCnn} de {resumo.totalCnn} fotos nesta partida.
            {config.modoDemonstracao && resumo.tempoMedioCnnMs ? ` Tempo médio de inferência: ${resumo.tempoMedioCnnMs.toFixed(0)} ms.` : ''}
          </p>
        )}
        {dica}
        <div className="linha-botoes">{acoes}</div>
      </div>
    </div>
  )
}
