#!/usr/bin/env bash
# ==========================================================================
#  EcoAventura - instalação no macOS e no Linux
#  Uso (na pasta do projeto):  bash instalar.sh
#  Cria o ambiente Python do servidor, instala as dependências do site
#  e constrói o jogo. Depois, rode:  bash iniciar_servidor.sh
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")"

# 1) Python 3.10 a 3.13 (o TensorFlow 2.21 não tem pacote para 3.14)
PY=""
for candidato in python3.12 python3.13 python3.11 python3.10 python3; do
  if command -v "$candidato" >/dev/null 2>&1; then
    if "$candidato" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)'; then
      PY="$candidato"
      break
    fi
  fi
done
if [ -z "$PY" ]; then
  echo "ERRO: instale o Python 3.10, 3.11, 3.12 ou 3.13 (recomendado: 3.12)." >&2
  exit 1
fi
echo "Python encontrado: $($PY --version)"

# 2) Node.js 20 ou mais novo
if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: instale o Node.js 20 ou mais novo (https://nodejs.org)." >&2
  exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)'; then
  echo "ERRO: o Node.js precisa ser a versão 20 ou mais nova (atual: $(node --version))." >&2
  exit 1
fi
echo "Node encontrado: $(node --version)"

# 3) Servidor (FastAPI + TensorFlow)
echo
echo "== Instalando o servidor (pode demorar: o TensorFlow tem ~500 MB) =="
"$PY" -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt

# 4) Site (React + Vite)
echo
echo "== Instalando e construindo o site =="
(cd frontend && npm ci && npm run build)

echo
echo "Pronto! Para jogar, rode:  bash iniciar_servidor.sh"
echo "e abra http://localhost:8000 no Chrome, Edge ou Firefox."
