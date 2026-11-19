"""Testes da API de inferência (carrega o modelo E8 real).

Executar a partir de ecoaventura/backend:
    .venv/Scripts/python -m pytest -q
"""

import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main  # noqa: E402


@pytest.fixture(scope="module")
def cliente():
    with TestClient(main.app) as c:  # dispara o carregamento único do modelo
        yield c


def _png(cor=(200, 30, 30), tam=(300, 200)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", tam, cor).save(buf, format="PNG")
    return buf.getvalue()


def test_saude_modelo_e8(cliente):
    r = cliente.get("/api/saude").json()
    assert r["modelo_carregado"], r["erro"]
    assert r["modelo"] == "E8"
    assert r["entrada"] == [128, 128, 3]
    assert len(r["classes"]) == 12
    assert r["classes"][0] == "battery" and r["classes"][-1] == "white-glass"
    assert r["verificacoes"]["parametros_conferem_com_E8"] is True
    assert r["verificacoes"]["reescala_interna_0_1_para_0_255"]


def test_classificar_retorna_12_probabilidades(cliente):
    r = cliente.post("/api/classificar", files={"arquivo": ("x.png", _png(), "image/png")}).json()
    assert r["modelo"] == "E8"
    assert len(r["probabilidades"]) == 12
    assert abs(sum(r["probabilidades"].values()) - 1) < 1e-3
    assert r["classe_prevista"] == max(r["probabilidades"], key=r["probabilidades"].get)
    assert r["confianca"] == r["probabilidades"][r["classe_prevista"]]


def test_modelo_nao_e_recarregado(cliente):
    modelo = main.classificador._modelo
    cliente.post("/api/classificar", files={"arquivo": ("x.png", _png((10, 120, 10)), "image/png")})
    assert main.classificador._modelo is modelo


def test_preprocessamento_igual_ao_treino():
    """Entrada 0–1 (float32 / 255) e resize bilinear para 128×128; sem 2ª normalização."""
    x = main.classificador.preprocessar(_png((255, 0, 128)))
    assert x.shape == (1, 128, 128, 3) and x.dtype == np.float32
    assert x.max() <= 1.0 and x.min() >= 0.0
    assert np.allclose(x[0, 0, 0], [1.0, 0.0, 128 / 255], atol=1e-6)


def test_classificar_por_id_do_manifesto(cliente):
    manifesto = json.loads(main.MANIFESTO.read_text(encoding="utf-8"))
    if not manifesto["imagens"]:
        pytest.skip("manifesto vazio")
    img = manifesto["imagens"][0]
    r = cliente.post("/api/classificar", data={"imagem_id": img["id"]})
    assert r.status_code == 200
    assert r.json()["imagem_id"] == img["id"]


def test_erros_de_entrada(cliente):
    assert cliente.post("/api/classificar").status_code == 422
    assert cliente.post("/api/classificar", data={"imagem_id": "nao_existe"}).status_code == 404
    r = cliente.post("/api/classificar", files={"arquivo": ("x.txt", b"nao sou imagem", "text/plain")})
    assert r.status_code == 400


def test_pontuacao_valida(cliente, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "ARQUIVO_PONTUACOES", tmp_path / "p.json")
    ok = cliente.post("/api/pontuacoes", json={"jogo": "desafio_piscar", "pontos": 1050, "acertos": 9, "erros": 1})
    assert ok.status_code == 200
    assert cliente.post("/api/pontuacoes", json={"jogo": "outro", "pontos": 1, "acertos": 0, "erros": 0}).status_code == 422
    assert cliente.post("/api/pontuacoes", json={"jogo": "desafio_piscar", "pontos": -5, "acertos": 0, "erros": 0}).status_code == 422


def test_tta_mantem_preprocessamento_e_media():
    """TTA: cada versão passa pelo mesmo pipeline (128×128, 0–1); a saída é a média (soma 1)."""
    clf = main.classificador
    dados = _png((30, 140, 60), (300, 200))
    x = clf.preprocessar(dados, "espelho_recorte")
    assert x.shape == (4, 128, 128, 3) and x.max() <= 1.0 and x.min() >= 0.0
    p = clf.probabilidades(dados, "espelho_recorte")
    assert p.shape == (12,) and abs(p.sum() - 1) < 1e-3
    with pytest.raises(ValueError):
        clf.probabilidades(dados, "invalido")


def test_cache_limitado(cliente):
    from inference import TAMANHO_CACHE

    for i in range(TAMANHO_CACHE + 5):
        main.classificador._cache[f"x{i}"] = {}
    main.classificador.classificar(_png((1, 2, 3)))
    assert len(main.classificador._cache) <= TAMANHO_CACHE


def test_upload_pode_ser_desligado(cliente, monkeypatch):
    monkeypatch.setattr(main, "PERMITIR_UPLOAD", False)
    r = cliente.post("/api/classificar", files={"arquivo": ("x.png", _png(), "image/png")})
    assert r.status_code == 403


def test_limite_por_visitante(cliente, monkeypatch):
    monkeypatch.setitem(main.LIMITES, "pontuacoes", 2)
    monkeypatch.setattr(main, "ARQUIVO_PONTUACOES", main.PASTA_DADOS / "_teste_pontos.json")
    corpo = {"jogo": "desafio_piscar", "pontos": 1, "acertos": 1, "erros": 0}
    h = {"cf-connecting-ip": "203.0.113.9"}
    try:
        codigos = [cliente.post("/api/pontuacoes", json=corpo, headers=h).status_code for _ in range(3)]
    finally:
        main.ARQUIVO_PONTUACOES.unlink(missing_ok=True)
    assert codigos == [200, 200, 429]


def test_site_e_rotas_do_react():
    if not main.PASTA_SITE.is_dir():
        pytest.skip("frontend/dist ainda não foi construído")
    with TestClient(main.app) as c:
        assert "<div id=\"root\">" in c.get("/jogo/piscar").text
        assert c.get("/api/nao-existe").status_code == 404
        wasm = c.get("/mediapipe/wasm/vision_wasm_internal.wasm")
        assert wasm.status_code == 200 and wasm.headers["content-type"] == "application/wasm"
