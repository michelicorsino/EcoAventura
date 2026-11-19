# Testes — EcoAventura

## 1. Testes automatizados (executados em 17/11/2026)

### Backend — `backend/tests/test_api.py` (pytest, modelo E8 real) — **12/12 passaram**

| Teste | O que verifica |
|---|---|
| `test_saude_modelo_e8` | Modelo E8 carregado, entrada 128×128×3, 12 classes na ordem original, nº de parâmetros = `selecao_modelo.json`, camada `Rescaling(255)` presente |
| `test_classificar_retorna_12_probabilidades` | Resposta com as 12 probabilidades, soma ≈ 1, `classe_prevista` = argmax, `confianca` coerente |
| `test_modelo_nao_e_recarregado` | O mesmo objeto de modelo atende várias requisições |
| `test_preprocessamento_igual_ao_treino` | Tensor `float32` em [0, 1], formato (1, 128, 128, 3), pixel (255, 0, 128) → (1, 0, 0,502) — sem 2ª normalização |
| `test_classificar_por_id_do_manifesto` | Classificação por `imagem_id` do manifesto |
| `test_erros_de_entrada` | 422 sem imagem, 404 id inexistente, 400 arquivo que não é imagem |
| `test_tta_mantem_preprocessamento_e_media` | TTA: 4 versões 128×128 em [0,1]; média com soma 1; modo inválido rejeitado |
| `test_cache_limitado` | O cache nunca passa de 256 resultados |
| `test_pontuacao_valida` | Pontuação salva; jogo desconhecido e pontos negativos rejeitados |

### Frontend — `frontend/src/__tests__` (Vitest) — **47/47 passaram**

Detector de piscadas (quadros sintéticos a 30 fps):

| Caso | Esperado | Resultado |
|---|---|---|
| 1 piscada esquerda | A, emitido só após a janela de 900 ms | ✅ |
| 1 piscada direita | B | ✅ |
| 2 piscadas esquerdas dentro da janela | C | ✅ |
| 2 piscadas direitas dentro da janela | D | ✅ |
| Duas piscadas bilaterais (involuntárias) | nenhum comando, 2 eventos bilaterais | ✅ |
| 2ª piscada fora da janela | dois comandos A | ✅ |
| Olho fechado por 3 s | nenhum comando | ✅ |
| Fechamento de 1 quadro (ruído) | nenhum comando | ✅ |
| Rosto perdido com piscada pendente | piscada descartada | ✅ |
| Bloqueio durante feedback | piscadas ignoradas | ✅ |
| Calibração: canal invertido, baixa confiabilidade, coletas incoerentes | detectado / marcado / rejeitado | ✅ |
| Modo cabeça (permanência) e cabeça + boca | D e A; exige voltar ao centro | ✅ |

Preparo e confirmação (`preparoConfirmacao.test.ts`): piscada sem 1 s de olhos abertos é ignorada; com preparo vale;
piscada com a cabeça girando é ignorada; fechamento < 150 ms é ignorado; depois de um comando é preciso se preparar de
novo; fechar os dois olhos por 1 s confirma uma vez só; piscadas naturais e piscar um olho só não confirmam; gesto que já
vinha acontecendo não confirma; boca aberta segurada confirma e “falar” não; bloqueio do feedback impede confirmar.

Voltar (`voltar.test.ts`): balançar a cabeça esq-dir-esq é reconhecido uma vez; virar para um lado só, tremidinhas
pequenas e movimentos lentos e espaçados não contam; fechar um olho enquanto balança a cabeça não vira piscada.

Regras dos jogos: pontuação do quiz (sequência de 10 respostas → 1.050 pontos), alternativas distintas com
exatamente 1 correta, sem repetir imagem, posição correta nunca repetida em rodadas seguidas e equilibrada,
rodadas da Conexão com 4 classes distintas e dificuldade progressiva (4 sementes aleatórias), pinça com
histerese e cancelamento quando a mão some.

### Teste de ponta a ponta no navegador (sem câmera, modo teclado/mouse)

- Desafio do Piscar, 10 rodadas: pontuação 100 → 200 → 350 (bônus) → 450, erros sem desconto; feedback mostra
  resposta correta, mensagem educativa e a previsão real da CNN E8 separadamente. ✅
- Conexão Ecológica, 5 rodadas com 1 erro na rodada 3: 2.400 pontos (4 rodadas perfeitas com bônus), linhas
  corretas fixadas, ligação errada pisca em vermelho e permite nova tentativa. ✅
- Câmera bloqueada: mensagem “A câmera foi bloqueada…” exibida. ✅
- MediaPipe Face e Hand Landmarker carregam localmente no navegador. ✅
- Console sem erros. ✅

> As previsões da CNN nesses testes foram feitas sobre os **desenhos provisórios**, não sobre fotografias;
> servem só para verificar o fluxo, não o desempenho do modelo.

## 2. Testes manuais com câmera — **a fazer pela equipe**

A detecção real de olhos e mãos depende de webcam, pessoa e ambiente, e não pôde ser verificada no ambiente
de desenvolvimento (sem câmera). Use o roteiro abaixo e registre os resultados.

| # | Cenário | Como testar | Esperado | Resultado / observações |
|---|---|---|---|---|
| M1 | Calibração dos olhos | Seguir as etapas na luz normal | Conclui; teste A–D reconhecido | |
| M2 | Piscadas naturais e movimentos | Responder 10 perguntas piscando normalmente, mexendo a cabeça e falando entre os comandos | Nenhuma alternativa marcada sem querer; nenhuma resposta registrada sem o gesto de confirmar | |
| M2c | Voltar | Marcar uma alternativa e balançar a cabeça dizendo “não” | Escolha desmarcada; nada registrado | |
| M2b | Gesto de confirmar | Confirmar 10 respostas fechando os dois olhos por 1 s (e depois com a boca) | Confirma só quando segurado | |
| M3 | Piscada dupla | 10× cada gesto C e D | Taxa de acerto do gesto | |
| M4 | Iluminação fraca | Apagar a luz principal | Aviso “Está um pouco escuro”; registrar taxa de detecção | |
| M5 | Contraluz | Janela atrás da criança | Registrar comportamento | |
| M6 | Óculos | Criança/adulto de óculos | Registrar confiabilidade da calibração | |
| M7 | Rosto sai do quadro | Sair da frente da câmera no meio da pergunta | Aviso; nenhum comando; volta normal | |
| M8 | Modo cabeça e modo boca | Responder 10 perguntas em cada modo | Sem respostas involuntárias | |
| M9 | Calibração da pinça | Mão aberta → pinça → 3 estrelas | Conclui | |
| M10 | Conexões com pinça | 1 partida completa | Ligações corretas; cursor estável | |
| M11 | Mão sai do quadro durante a ligação | Retirar a mão com a pinça fechada | Ligação cancelada, sem penalidade | |
| M12 | Modo permanência | 1 partida completa | Funciona sem pinça | |
| M13 | Jogo inteiro sem mouse | Do “Jogar” ao resultado, só com gestos | Possível nos dois jogos* | |
| M14 | Parar câmera | Botão “Parar câmera” durante o jogo | Câmera desliga; jogo volta à autorização | |
| M15 | Notebook comum | Medir fluidez (FPS) num notebook sem GPU dedicada | Cursor fluido | |
| M16 | Crianças (com supervisão e autorização dos responsáveis) | Sessões curtas | Compreensão das instruções | |

\* As telas de menu (Início e Escolha do jogo) usam botões grandes e teclado; dentro de cada jogo — instruções,
partida, feedback, pausa e resultado — tudo é feito com gestos.

## 3. Avaliação da CNN em dados novos

Depois de cadastrar e revisar as 48 fotografias reais:

```bash
backend/.venv/Scripts/python -I ferramentas/avaliar_generalizacao.py
```

O relatório `data/relatorios/generalizacao_E8.json` traz acurácia, F1 macro, métricas por classe, matriz de
confusão e a lista de erros, para comparar com o teste original do E8 (acurácia 0,943; F1 macro 0,920).
