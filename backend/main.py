"""API EcoAventura — classificação de resíduos com a CNN E8.

Executar (a partir de ecoaventura/backend):
    .venv/Scripts/python -m uvicorn main:app --port 8000

Se ``frontend/dist`` existir (``npm run build``), este mesmo servidor também
entrega o jogo: tudo num único endereço (http://localhost:8000), que é o que o
Cloudflare Tunnel publica no domínio. Veja ``iniciar_servidor.bat``.
"""

from __future__ import annotations

import json
import mimetypes
import os
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from inference import ClassificadorE8, ErroModelo

RAIZ = Path(__file__).resolve().parent
PASTA_MODELO = Path(os.environ.get("ECO_MODEL_DIR", RAIZ / "model"))
PASTA_DADOS = Path(os.environ.get("ECO_DATA_DIR", RAIZ.parent / "data"))
MANIFESTO = PASTA_DADOS / "imagens_jogos.json"
PASTA_IMAGENS = PASTA_DADOS / "imagens_jogos"
ARQUIVO_PONTUACOES = PASTA_DADOS / "pontuacoes.json"
TAMANHO_MAX = 8 * 1024 * 1024
PASTA_SITE = Path(os.environ.get("ECO_SITE_DIR", RAIZ.parent / "frontend" / "dist"))
# Publicado na internet, o jogo só precisa classificar as fotos do manifesto (por id).
# Com ECO_PERMITIR_UPLOAD=0, ninguém de fora consegue mandar imagens arbitrárias
# para a CNN gastar o processador do PC.
PERMITIR_UPLOAD = os.environ.get("ECO_PERMITIR_UPLOAD", "1") == "1"
# Limite simples por visitante (requisições por minuto), contra abuso.
LIMITES = {"classificar": 120, "pontuacoes": 20}

# O Windows nem sempre conhece o tipo .wasm; sem ele o MediaPipe não carrega.
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/octet-stream", ".task")

classificador = ClassificadorE8(PASTA_MODELO)
_lock_pontos = threading.Lock()
_acessos: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock_acessos = threading.Lock()


def limitar(request: Request, grupo: str) -> None:
    """Janela deslizante de 60 s por IP. Atrás do Cloudflare o IP real vem no CF-Connecting-IP."""
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")
    agora = time.monotonic()
    with _lock_acessos:
        fila = _acessos[(grupo, ip)]
        while fila and agora - fila[0] > 60:
            fila.popleft()
        if len(fila) >= LIMITES[grupo]:
            raise HTTPException(429, "Muitas requisições. Espere um pouquinho e tente de novo.")
        fila.append(agora)
        if len(_acessos) > 10000:  # não deixa a tabela crescer sem fim
            _acessos.clear()


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    classificador.carregar()  # uma única vez, nunca por requisição
    yield


app = FastAPI(title="EcoAventura API", version="1.0.0", lifespan=ciclo_de_vida)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ECO_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

PASTA_IMAGENS.mkdir(parents=True, exist_ok=True)
app.mount("/imagens", StaticFiles(directory=PASTA_IMAGENS), name="imagens")


def ler_manifesto() -> dict[str, Any]:
    if not MANIFESTO.exists():
        return {"imagens": []}
    with MANIFESTO.open("r", encoding="utf-8") as f:
        return json.load(f)


def imagens_por_id() -> dict[str, dict[str, Any]]:
    return {img["id"]: img for img in ler_manifesto().get("imagens", [])}


@app.get("/api/saude")
def saude() -> dict[str, Any]:
    e = classificador.estado
    imagens = ler_manifesto().get("imagens", [])
    return {
        "status": "ok" if e.carregado else "erro",
        "modelo_carregado": e.carregado,
        "modelo": e.experimento,
        "arquitetura": e.arquitetura,
        "entrada": e.entrada,
        "classes": e.classes,
        "parametros": e.parametros,
        "tta": classificador.modo_tta,
        "verificacoes": e.verificacoes,
        "tempo_carregamento_s": e.tempo_carregamento_s,
        "erro": e.erro,
        "imagens_cadastradas": len(imagens),
        "imagens_revisadas": sum(1 for i in imagens if i.get("revisada")),
    }


@app.get("/api/imagens")
def listar_imagens(incluir_nao_revisadas: bool = True) -> dict[str, Any]:
    """Manifesto para os jogos. Só lista arquivos que existem de fato."""
    dados = ler_manifesto()
    saida = []
    for img in dados.get("imagens", []):
        if not (PASTA_IMAGENS / img["caminho"]).exists():
            continue
        if not incluir_nao_revisadas and not img.get("revisada"):
            continue
        saida.append({
            "id": img["id"],
            "classe": img["classe"],
            "url": f"/imagens/{img['caminho']}",
            "origem": img.get("origem"),
            "revisada": bool(img.get("revisada")),
            "provisoria": img.get("origem") == "placeholder",
        })
    return {"imagens": saida}


@app.post("/api/classificar")
async def classificar(
    request: Request,
    arquivo: UploadFile | None = File(default=None),
    imagem_id: str | None = Form(default=None),
) -> dict[str, Any]:
    """Classifica uma fotografia de resíduo selecionada pelo jogo.

    Envie ``arquivo`` (multipart) e/ou ``imagem_id``. Sem arquivo, a imagem
    é lida do manifesto pelo id. O rótulo verdadeiro NUNCA vem daqui.
    """
    limitar(request, "classificar")
    if arquivo is not None:
        if not PERMITIR_UPLOAD:
            raise HTTPException(403, "Envio de imagens desativado neste servidor; use imagem_id.")
        dados = await arquivo.read(TAMANHO_MAX + 1)
        if len(dados) > TAMANHO_MAX:
            raise HTTPException(413, "Imagem maior que 8 MB")
    elif imagem_id:
        img = imagens_por_id().get(imagem_id)
        if img is None:
            raise HTTPException(404, f"imagem_id '{imagem_id}' não está no manifesto")
        caminho = (PASTA_IMAGENS / img["caminho"]).resolve()
        if PASTA_IMAGENS.resolve() not in caminho.parents or not caminho.exists():
            raise HTTPException(404, "arquivo da imagem não encontrado")
        dados = caminho.read_bytes()
    else:
        raise HTTPException(422, "envie 'arquivo' ou 'imagem_id'")

    try:
        resultado = await run_in_threadpool(classificador.classificar, dados)
    except ErroModelo as exc:
        raise HTTPException(503, f"Modelo indisponível: {exc}") from exc
    except Exception as exc:  # decode_image falha com arquivos inválidos
        raise HTTPException(400, f"Não foi possível ler a imagem: {type(exc).__name__}") from exc

    return {"imagem_id": imagem_id, **resultado}


class Pontuacao(BaseModel):
    jogo: str = Field(pattern="^(desafio_piscar|conexao_ecologica)$")
    pontos: int = Field(ge=0, le=100000)
    acertos: int = Field(ge=0, le=1000)
    erros: int = Field(ge=0, le=1000)
    acertos_cnn: int | None = Field(default=None, ge=0, le=1000)
    total_cnn: int | None = Field(default=None, ge=0, le=1000)


@app.get("/api/pontuacoes")
def listar_pontuacoes() -> dict[str, Any]:
    if not ARQUIVO_PONTUACOES.exists():
        return {"pontuacoes": []}
    return json.loads(ARQUIVO_PONTUACOES.read_text(encoding="utf-8"))


@app.post("/api/pontuacoes")
def salvar_pontuacao(p: Pontuacao, request: Request) -> dict[str, Any]:
    """Guarda só números da partida (sem nome, foto ou dado biométrico)."""
    limitar(request, "pontuacoes")
    with _lock_pontos:
        dados = listar_pontuacoes()
        registro = {**p.model_dump(), "data": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        dados["pontuacoes"] = (dados["pontuacoes"] + [registro])[-200:]
        ARQUIVO_PONTUACOES.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return registro


# ---------------------------------------------------------------- site do jogo
# Registrado por último: as rotas /api e /imagens acima têm prioridade.
if PASTA_SITE.is_dir():
    _site = PASTA_SITE.resolve()

    @app.get("/{caminho:path}", include_in_schema=False)
    def site(caminho: str) -> FileResponse:
        if caminho.startswith("api/"):
            raise HTTPException(404, "rota inexistente")
        arquivo = (_site / caminho).resolve()
        if caminho and arquivo.is_file() and _site in arquivo.parents:
            # arquivos com hash no nome (assets/) e modelos do MediaPipe quase nunca mudam
            if caminho.startswith("assets/"):
                cache = "public, max-age=31536000, immutable"
            elif caminho.startswith("mediapipe/"):
                cache = "public, max-age=604800"
            else:
                cache = "no-cache"
            return FileResponse(arquivo, headers={"Cache-Control": cache})
        # rotas do React (/jogos, /jogo/piscar...) recebem o index.html
        return FileResponse(_site / "index.html", headers={"Cache-Control": "no-cache"})
