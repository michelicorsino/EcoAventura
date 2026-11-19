import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../components/UI'
import { useCamera } from '../context/CameraContext'
import { useConfig, type ControleFacial, type ControleMao } from '../context/ConfigContext'
import type { GestoConfirmacao } from '../vision/blinkDetection'
import { obterSaude, type SaudeApi } from '../services/classifierApi'

export default function Configuracoes() {
  const navigate = useNavigate()
  const { config, alterar, restaurar, calibracoes, setCalibracoes } = useConfig()
  const { status, desligar } = useCamera()
  const [saude, setSaude] = useState<SaudeApi | null>(null)
  const [erroSaude, setErroSaude] = useState<string | null>(null)

  useEffect(() => {
    if (!config.modoDemonstracao) return
    obterSaude()
      .then(setSaude)
      .catch((e) => setErroSaude(String(e.message ?? e)))
  }, [config.modoDemonstracao])

  return (
    <div className="tela-centro">
      <div className="cartao cartao-largo configuracoes">
        <h1>⚙ Configurações</h1>

        <section>
          <h2>Geral</h2>
          <Alternar rotulo="🔊 Sons" valor={config.som} aoMudar={(v) => alterar({ som: v })} />
          <Alternar rotulo="📷 Mostrar a minha imagem da câmera" valor={config.mostrarCamera} aoMudar={(v) => alterar({ mostrarCamera: v })} />
          <Faixa
            rotulo={`Economia de processamento: ${config.fpsVisao} análises da câmera por segundo${config.fpsVisao <= 15 ? ' (PC mais leve)' : ''}`}
            min={10}
            max={30}
            passo={1}
            valor={config.fpsVisao}
            aoMudar={(v) => alterar({ fpsVisao: v })}
          />
          {status === 'ligada' && (
            <Botao cor="laranja" onClick={desligar}>
              ⏹ Desligar câmera agora
            </Botao>
          )}
        </section>

        <section>
          <h2>Jeitos de jogar: Desafio do Piscar</h2>
          <Escolha<ControleFacial>
            rotulo="Como responder"
            valor={config.controleFacial}
            opcoes={[
              ['piscadas', '👁️ Piscando (um olho de cada vez)'],
              ['cabeca', '🙂 Apontando com a cabeça e esperando um pouquinho'],
              ['boca', '😮 Apontando com a cabeça e abrindo a boca'],
            ]}
            aoMudar={(v) => alterar({ controleFacial: v })}
          />
          <Faixa
            rotulo={`Tempo para a segunda piscada: ${(config.janelaDuplaMs / 1000).toFixed(2)} s`}
            min={500}
            max={1600}
            passo={50}
            valor={config.janelaDuplaMs}
            aoMudar={(v) => alterar({ janelaDuplaMs: v })}
          />
          <Faixa
            rotulo={`Pausa entre um gesto e outro: ${config.cooldownMs} ms`}
            min={300}
            max={1500}
            passo={50}
            valor={config.cooldownMs}
            aoMudar={(v) => alterar({ cooldownMs: v })}
          />
          <Faixa
            rotulo={`Tempo para se preparar antes de cada gesto (olhos abertos e cabeça parada): ${(config.preparoMs / 1000).toFixed(1)} s`}
            min={300}
            max={3000}
            passo={100}
            valor={config.preparoMs}
            aoMudar={(v) => alterar({ preparoMs: v })}
          />
          <Faixa
            rotulo={`Duração mínima da piscada (quanto maior, mais piscadas rápidas são ignoradas): ${config.duracaoMinPiscadaMs} ms`}
            min={80}
            max={400}
            passo={10}
            valor={config.duracaoMinPiscadaMs}
            aoMudar={(v) => alterar({ duracaoMinPiscadaMs: v })}
          />
          <Escolha<GestoConfirmacao>
            rotulo="Como confirmar a resposta"
            valor={config.gestoConfirmacao}
            opcoes={[
              ['olhos', '😌 Fechando os dois olhos por um instante'],
              ['boca', '😮 Abrindo a boca por um instante'],
            ]}
            aoMudar={(v) => alterar({ gestoConfirmacao: v })}
          />
          {config.controleFacial === 'boca' && (
            <p className="nota">Quando a boca é usada para escolher, a confirmação é sempre fechando os olhos.</p>
          )}
          <Faixa
            rotulo={`Quanto tempo segurar o gesto de confirmar: ${(config.duracaoConfirmacaoMs / 1000).toFixed(1)} s`}
            min={500}
            max={2500}
            passo={100}
            valor={config.duracaoConfirmacaoMs}
            aoMudar={(v) => alterar({ duracaoConfirmacaoMs: v })}
          />
          <Faixa
            rotulo={`Sensibilidade da cabeça: ${config.sensibilidadeCabeca.toFixed(1)}×`}
            min={0.6}
            max={2}
            passo={0.1}
            valor={config.sensibilidadeCabeca}
            aoMudar={(v) => alterar({ sensibilidadeCabeca: v })}
          />
        </section>

        <section>
          <h2>Jeitos de jogar: Conexão Ecológica</h2>
          <Escolha<ControleMao>
            rotulo="Como puxar e soltar a linha"
            valor={config.controleMao}
            opcoes={[
              ['pinca', '🤏 Fazendo uma pinça (polegar + indicador)'],
              ['permanencia', '⏳ Parando a folhinha em cima'],
            ]}
            aoMudar={(v) => alterar({ controleMao: v })}
          />
          <Faixa
            rotulo={`Quanto tempo parar em cima: ${(config.tempoPermanenciaMs / 1000).toFixed(1)} s`}
            min={600}
            max={3000}
            passo={100}
            valor={config.tempoPermanenciaMs}
            aoMudar={(v) => alterar({ tempoPermanenciaMs: v })}
          />
          <Faixa
            rotulo={`Suavidade da folhinha: ${Math.round(config.suavizacaoCursor * 100)}%`}
            min={0}
            max={1}
            passo={0.05}
            valor={config.suavizacaoCursor}
            aoMudar={(v) => alterar({ suavizacaoCursor: v })}
          />
          <Faixa
            rotulo={config.avancoAutomaticoMs ? `Passar sozinho para a próxima pergunta depois de ${config.avancoAutomaticoMs / 1000} s` : 'Passar sozinho para a próxima pergunta: desligado'}
            min={0}
            max={10000}
            passo={1000}
            valor={config.avancoAutomaticoMs}
            aoMudar={(v) => alterar({ avancoAutomaticoMs: v })}
          />
        </section>

        <section>
          <h2>Ajustes dos gestos</h2>
          <p className="nota">
            Olhos: {calibracoes.olhos ? `ajustados (precisão ${calibracoes.olhos.confiabilidade})` : 'ainda não ajustados'} · Cabeça:{' '}
            {calibracoes.cabeca ? 'ajustada' : 'ainda não ajustada'} · Pinça: {calibracoes.pinca ? 'ajustada' : 'padrão'}. Esses ajustes não são
            salvos: somem quando a página é fechada.
          </p>
          <Botao cor="branco" onClick={() => setCalibracoes({ olhos: undefined, cabeca: undefined, pinca: undefined })}>
            Apagar ajustes
          </Botao>
        </section>

        <section>
          <h2>Modo de apresentação (acadêmico)</h2>
          <Alternar
            rotulo="Mostrar os tempos da CNN e informações técnicas"
            valor={config.modoDemonstracao}
            aoMudar={(v) => alterar({ modoDemonstracao: v })}
          />
          {config.modoDemonstracao && (
            <div className="painel-tecnico">
              {erroSaude && <p className="alerta">API indisponível: {erroSaude}</p>}
              {saude && (
                <>
                  <p>
                    <strong>Status:</strong> {saude.status === 'ok' ? '✅ modelo carregado' : `❌ ${saude.erro}`}
                  </p>
                  <p>
                    <strong>Modelo:</strong> {saude.modelo} · {saude.arquitetura} · entrada {saude.entrada.join('×')} ·{' '}
                    {saude.parametros?.toLocaleString('pt-BR')} parâmetros · carregado em {saude.tempo_carregamento_s}s
                  </p>
                  <p>
                    <strong>Imagens dos jogos:</strong> {saude.imagens_cadastradas} cadastradas, {saude.imagens_revisadas} revisadas
                  </p>
                  <ul>
                    {Object.entries(saude.verificacoes).map(([k, v]) => (
                      <li key={k}>
                        {v === true ? '✅' : 'ℹ️'} {k.replaceAll('_', ' ')}
                        {v !== true ? `: ${v}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>

        <div className="linha-botoes">
          <Botao cor="branco" onClick={restaurar}>
            Voltar ao padrão
          </Botao>
          <Botao onClick={() => navigate(-1)}>Pronto ✓</Botao>
        </div>
      </div>
    </div>
  )
}

function Alternar({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="campo campo-alternar">
      <input type="checkbox" checked={valor} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="alternador" aria-hidden />
      <span>{rotulo}</span>
    </label>
  )
}

function Faixa(p: { rotulo: string; min: number; max: number; passo: number; valor: number; aoMudar: (v: number) => void }) {
  return (
    <label className="campo">
      <span>{p.rotulo}</span>
      <input type="range" min={p.min} max={p.max} step={p.passo} value={p.valor} onChange={(e) => p.aoMudar(Number(e.target.value))} />
    </label>
  )
}

function Escolha<T extends string>({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: T; opcoes: [T, string][]; aoMudar: (v: T) => void }) {
  return (
    <fieldset className="campo escolha">
      <legend>{rotulo}</legend>
      {opcoes.map(([v, texto]) => (
        <label key={v} className={valor === v ? 'marcada' : ''}>
          <input type="radio" checked={valor === v} onChange={() => aoMudar(v)} />
          {texto}
        </label>
      ))}
    </fieldset>
  )
}
