"""Serviço de inferência da CNN E8 (EfficientNetB0, transferência + fine-tuning).

Regras seguidas (ver especificação, seção 8):
- Carrega SOMENTE ``model/melhor_modelo.keras`` (nunca escolhe outro .keras do diretório).
- Ordem de classes vem de ``classes.json`` e é conferida com ``preprocessamento.json``.
- Pré-processamento idêntico ao do treino: ``tf.io.decode_image(channels=3,
  expand_animations=False)`` -> resize bilinear para (altura, largura) -> float32 / 255.0.
  A conversão para a escala do backbone EfficientNetB0 acontece DENTRO do modelo;
  por isso não aplicamos nenhuma segunda normalização aqui.
- O modelo é carregado uma única vez (na inicialização do backend).
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

ARQUIVO_MODELO = "melhor_modelo.keras"
EXPERIMENTO_ESPERADO = "E8"
TAMANHO_CACHE = 256


class ErroModelo(RuntimeError):
    """Falha de carregamento ou de validação do modelo."""


def _ler_json(caminho: Path) -> dict[str, Any] | None:
    if not caminho.exists():
        return None
    with caminho.open("r", encoding="utf-8") as f:
        return json.load(f)


@dataclass
class EstadoModelo:
    carregado: bool = False
    erro: str | None = None
    experimento: str | None = None
    arquitetura: str | None = None
    entrada: list[int] = field(default_factory=list)
    classes: list[str] = field(default_factory=list)
    parametros: int | None = None
    verificacoes: dict[str, bool | str] = field(default_factory=dict)
    tempo_carregamento_s: float | None = None


class ClassificadorE8:
    def __init__(self, pasta_modelo: Path):
        self.pasta = Path(pasta_modelo)
        self.estado = EstadoModelo()
        self._modelo = None
        self._tf = None
        self._lock = threading.Lock()
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self.modo_tta = os.environ.get("ECO_TTA", "espelho_recorte")
        self.altura = 0
        self.largura = 0

    # ------------------------------------------------------------------ carga
    def carregar(self) -> None:
        inicio = time.perf_counter()
        try:
            self._carregar()
            self.estado.carregado = True
        except Exception as exc:  # noqa: BLE001 — queremos reportar qualquer falha em /api/saude
            self.estado.carregado = False
            self.estado.erro = f"{type(exc).__name__}: {exc}"
        finally:
            self.estado.tempo_carregamento_s = round(time.perf_counter() - inicio, 2)

    def _carregar(self) -> None:
        v = self.estado.verificacoes

        classes_json = _ler_json(self.pasta / "classes.json")
        prep = _ler_json(self.pasta / "preprocessamento.json")
        meta = _ler_json(self.pasta / "metadados_modelo.json")
        selecao = _ler_json(self.pasta / "selecao_modelo.json")
        if classes_json is None:
            raise ErroModelo("classes.json não encontrado")
        if prep is None:
            raise ErroModelo("preprocessamento.json não encontrado")

        # Ordem das classes: índice -> nome, exatamente como no treino.
        classes = [classes_json[str(i)] for i in range(len(classes_json))]
        if prep.get("ordem_classes") and prep["ordem_classes"] != classes:
            raise ErroModelo("ordem de classes diverge entre classes.json e preprocessamento.json")
        v["ordem_classes_consistente"] = True
        if len(classes) != 12:
            raise ErroModelo(f"esperadas 12 classes, encontradas {len(classes)}")

        if prep.get("normalizacao") != "float32 / 255.0":
            raise ErroModelo(f"normalização inesperada: {prep.get('normalizacao')!r}")
        if prep.get("formato_cor", "RGB") != "RGB":
            raise ErroModelo("formato de cor diferente de RGB não suportado")
        self.altura, self.largura = int(prep["altura"]), int(prep["largura"])

        # Identificação do experimento E8 (quando os arquivos existirem).
        if meta is not None:
            if meta.get("experimento") != EXPERIMENTO_ESPERADO:
                raise ErroModelo(f"metadados indicam experimento {meta.get('experimento')}, esperado E8")
            if meta.get("entrada") and list(meta["entrada"]) != [self.altura, self.largura, 3]:
                raise ErroModelo("entrada em metadados_modelo.json diverge de preprocessamento.json")
            v["metadados_E8"] = True
            self.estado.arquitetura = meta.get("arquitetura")
        else:
            v["metadados_E8"] = "arquivo ausente"
        if selecao is not None:
            if selecao.get("vencedor") != EXPERIMENTO_ESPERADO:
                raise ErroModelo(f"selecao_modelo.json indica vencedor {selecao.get('vencedor')}, esperado E8")
            v["selecao_E8"] = True
        else:
            v["selecao_E8"] = "arquivo ausente"

        caminho_modelo = self.pasta / ARQUIVO_MODELO
        if not caminho_modelo.exists():
            raise ErroModelo(f"{ARQUIVO_MODELO} não encontrado em {self.pasta}")

        import tensorflow as tf  # import tardio: só quando o modelo é realmente carregado
        import keras

        self._tf = tf
        # Poupa o PC: o navegador (MediaPipe) roda na mesma máquina. Lotes de
        # 1–4 imagens 128×128 não ganham nada com dezenas de threads.
        try:
            n = int(os.environ.get("ECO_TF_THREADS", "2"))
            tf.config.threading.set_intra_op_parallelism_threads(n)
            tf.config.threading.set_inter_op_parallelism_threads(1)
        except RuntimeError:
            pass  # já inicializado (ex.: testes que carregam o modelo duas vezes)
        modelo = keras.models.load_model(caminho_modelo, compile=False)

        saida = modelo.output_shape
        if saida[-1] != len(classes):
            raise ErroModelo(f"saída do modelo tem {saida[-1]} unidades, esperado {len(classes)}")
        v["saida_12_classes"] = True
        entrada = modelo.input_shape
        if tuple(entrada[1:]) != (self.altura, self.largura, 3):
            raise ErroModelo(f"entrada do modelo {entrada} diverge do pré-processamento")
        v["entrada_compativel"] = True

        # O E8 recebe 0–1 e tem uma camada Rescaling(255) antes do backbone.
        # Se ela existir, confirma que NÃO devemos normalizar de outra forma.
        reescala = [
            l for l in modelo.layers
            if type(l).__name__ == "Rescaling" and float(np.ravel(l.scale)[0]) == 255.0
        ]
        if not reescala:
            raise ErroModelo("camada Rescaling(255) do E8 não encontrada — entrada 0–1 não confirmada")
        v["reescala_interna_0_1_para_0_255"] = reescala[0].name

        parametros = int(modelo.count_params())
        if selecao is not None and selecao.get("parametros") is not None:
            if parametros != int(selecao["parametros"]):
                raise ErroModelo(
                    f"modelo tem {parametros} parâmetros; selecao_modelo.json registra {selecao['parametros']}"
                )
            v["parametros_conferem_com_E8"] = True

        # Aquecimento: a primeira chamada compila o grafo.
        modelo(np.zeros((1, self.altura, self.largura, 3), dtype=np.float32), training=False)

        self._modelo = modelo
        self.estado.experimento = EXPERIMENTO_ESPERADO
        self.estado.entrada = [self.altura, self.largura, 3]
        self.estado.classes = classes
        self.estado.parametros = parametros

    # ---------------------------------------------------------- pré-process.
    #: Modos de TTA (test-time augmentation). Cada versão passa pelo MESMO
    #: pipeline do treino (resize bilinear → /255); só muda o recorte/espelho.
    MODOS_TTA = ("desligado", "espelho", "espelho_recorte")

    def _versoes(self, img, modo: str):
        tf = self._tf
        versoes = [img]
        if modo in ("espelho", "espelho_recorte"):
            versoes.append(tf.image.flip_left_right(img))
        if modo == "espelho_recorte":
            # recorte central de 90% (tira bordas/fundo) e o seu espelho
            h, w = int(img.shape[0]), int(img.shape[1])
            dh, dw = max(1, round(h * 0.05)), max(1, round(w * 0.05))
            centro = img[dh : h - dh, dw : w - dw]
            versoes += [centro, tf.image.flip_left_right(centro)]
        return versoes

    def preprocessar(self, dados: bytes, modo: str = "desligado") -> np.ndarray:
        """Replica exatamente o pipeline de leitura do treino (um lote com as versões do TTA)."""
        tf = self._tf
        img = tf.io.decode_image(dados, channels=3, expand_animations=False)
        lote = [
            tf.cast(tf.image.resize(v, (self.altura, self.largura), method="bilinear"), tf.float32) / 255.0  # única normalização
            for v in self._versoes(img, modo)
        ]
        return tf.stack(lote).numpy()

    def probabilidades(self, dados: bytes, modo: str = "desligado") -> np.ndarray:
        """Média das probabilidades das versões (sem TTA: a própria previsão)."""
        if modo not in self.MODOS_TTA:
            raise ValueError(f"modo de TTA desconhecido: {modo}")
        x = self.preprocessar(dados, modo)
        with self._lock:
            p = np.asarray(self._modelo(x, training=False)).astype(float)
        return p.mean(axis=0)

    # --------------------------------------------------------------- predição
    def classificar(self, dados: bytes, modo: str | None = None) -> dict[str, Any]:
        if not self.estado.carregado or self._modelo is None:
            raise ErroModelo(self.estado.erro or "modelo não carregado")
        modo = modo or self.modo_tta

        chave = hashlib.sha256(dados).hexdigest() + ":" + modo
        if chave in self._cache:
            self._cache.move_to_end(chave)
            return {**self._cache[chave], "cache": True}

        inicio = time.perf_counter()
        probs = self.probabilidades(dados, modo)
        tempo_ms = (time.perf_counter() - inicio) * 1000

        soma = float(probs.sum())
        if not 0.98 <= soma <= 1.02:  # saída deveria ser softmax
            raise ErroModelo(f"saída do modelo não parece softmax (soma={soma:.3f})")

        idx = int(np.argmax(probs))
        classes = self.estado.classes
        resultado = {
            "modelo": EXPERIMENTO_ESPERADO,
            "tta": modo,
            "classe_prevista": classes[idx],
            "confianca": round(float(probs[idx]), 6),
            "probabilidades": {
                c: round(float(p), 6)
                for c, p in sorted(zip(classes, probs), key=lambda t: -t[1])
            },
            "tempo_inferencia_ms": round(tempo_ms, 1),
            "sha256": chave.split(":")[0],
        }
        self._cache[chave] = resultado
        while len(self._cache) > TAMANHO_CACHE:  # cache limitado (envios arbitrários não crescem a memória)
            self._cache.popitem(last=False)
        return {**resultado, "cache": False}
