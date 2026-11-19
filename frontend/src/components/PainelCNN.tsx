import { CATEGORIAS, nomeClasse, type Classe } from '../data/categorias'
import { useConfig } from '../context/ConfigContext'
import { topProbabilidades, type PrevisaoCNN } from '../services/classifierApi'
import { Robo } from './Personagens'

/**
 * Mostra a previsão da CNN E8 SEPARADA da resposta da criança.
 * O gabarito é sempre o rótulo do manifesto; a CNN serve só para demonstrar.
 */
export function PainelCNN({
  previsao,
  erro,
  classeVerdadeira,
}: {
  previsao: PrevisaoCNN | null | undefined
  erro?: string | null
  classeVerdadeira: Classe
}) {
  const { config } = useConfig()
  if (erro) {
    return (
      <div className="painel-cnn">
        <Robo tamanho={56} humor="triste" />
        <p>O robô não conseguiu dar o palpite agora ({erro}). Não se preocupe: isso não muda os seus pontos.</p>
      </div>
    )
  }
  if (!previsao) {
    return (
      <div className="painel-cnn">
        <Robo tamanho={56} humor="pensando" />
        <p>O robô está pensando…</p>
      </div>
    )
  }
  const acertou = previsao.classe_prevista === classeVerdadeira
  const duvida = duvidaEntreParecidos(previsao)
  return (
    <div className={`painel-cnn ${acertou ? 'cnn-certo' : 'cnn-errado'}`}>
      <Robo tamanho={56} humor={acertou ? 'animado' : 'pensando'} />
      <div>
        <p>
          <strong>Palpite do robô{config.modoDemonstracao ? ` (CNN ${previsao.modelo})` : ''}:</strong> {CATEGORIAS[previsao.classe_prevista]?.emoji}{' '}
          {nomeClasse(previsao.classe_prevista)}, com {(previsao.confianca * 100).toFixed(0)}% de certeza.{' '}
          {acertou ? 'Ele também acertou! 🤖✅' : 'Dessa vez o robô se enganou. 🤖❌'}
        </p>
        {duvida && (
          <p className="duvida-robo">
            🤔 O robô ficou em dúvida entre <strong>{nomeClasse(duvida.a)}</strong> e <strong>{nomeClasse(duvida.b)}</strong>. {duvida.dica}
          </p>
        )}
        <ul className="probs">
          {topProbabilidades(previsao, 3).map(([c, p]) => (
            <li key={c}>
              <span>{nomeClasse(c)}</span>
              <span className="probs-barra">
                <i style={{ width: `${p * 100}%`, background: CATEGORIAS[c as Classe]?.corLixeira }} />
              </span>
              <span>{(p * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        {config.modoDemonstracao && (
          <p className="nota">
            Inferência: {previsao.tempo_inferencia_ms.toFixed(0)} ms no servidor
            {previsao.tempo_total_ms ? ` · ${previsao.tempo_total_ms.toFixed(0)} ms total` : ''}
            {previsao.cache ? ' (cache)' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Pares que a CNN E8 mais confunde (matriz de confusão do teste original:
 * vidro transparente ↔ plástico e papel ↔ papelão). Quando os dois primeiros
 * palpites são um desses pares e estão próximos, mostramos a dúvida e uma dica
 * de como uma pessoa diferencia — vira um momento de aprendizado.
 */
const PARES_PARECIDOS: { par: [string, string]; dica: string }[] = [
  {
    par: ['plastic', 'white-glass'],
    dica: 'Eles são bem parecidos na foto! Na vida real, o vidro é mais pesado, mais frio e faz “tlim”; o plástico é leve e amassa.',
  },
  {
    par: ['paper', 'cardboard'],
    dica: 'Os dois vêm das árvores! O papelão é grosso e tem ondinhas por dentro; o papel é fino e dobra fácil.',
  },
  {
    par: ['plastic', 'trash'],
    dica: 'Embalagem de plástico limpa vai para a reciclagem; plástico sujo ou misturado com outros materiais vira lixo comum.',
  },
]

function duvidaEntreParecidos(p: PrevisaoCNN) {
  const [[a, pa], [b, pb]] = topProbabilidades(p, 2)
  if (pa - pb > 0.4) return null
  const par = PARES_PARECIDOS.find(({ par: [x, y] }) => (x === a && y === b) || (x === b && y === a))
  return par ? { a, b, dica: par.dica } : null
}
