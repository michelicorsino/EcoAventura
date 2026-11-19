#!/usr/bin/env bash
# ==========================================================================
#  EcoAventura - inicia o jogo completo em http://localhost:8000 (macOS/Linux)
#  (site + API + CNN num único endereço)
#
#  Uso:  bash iniciar_servidor.sh              -> inicia (constrói o site se faltar)
#        bash iniciar_servidor.sh --construir  -> reconstrói o site antes de iniciar
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/python ]; then
  echo "Ambiente não encontrado. Rode primeiro:  bash instalar.sh" >&2
  exit 1
fi

if [ "${1:-}" = "--construir" ] || [ ! -f frontend/dist/index.html ]; then
  echo "Construindo o site do jogo..."
  (cd frontend && npm run build)
fi

# Publicado na internet: só aceita classificar fotos do próprio jogo (por id)
export ECO_PERMITIR_UPLOAD=0
export ECO_TF_THREADS=2

echo
echo "EcoAventura rodando em http://localhost:8000  (Ctrl+C para parar)"
echo
cd backend
exec .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
