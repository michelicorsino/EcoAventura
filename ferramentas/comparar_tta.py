"""Compara a CNN E8 com e sem TTA (test-time augmentation) nas fotos dos jogos.

TTA = média das probabilidades da imagem original e de versões espelhadas /
levemente recortadas. NÃO altera os pesos do modelo nem o pré-processamento
de cada versão (decode → resize bilinear 128×128 → /255).

Atenção: escolher a configuração olhando estas mesmas 48 fotos deixa o número
otimista; trate o resultado como indicativo.

Uso (a partir de ecoaventura/):
    backend/.venv/Scripts/python -I ferramentas/comparar_tta.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
from inference import ClassificadorE8  # noqa: E402

PARES = [("plastic", "white-glass"), ("paper", "cardboard")]


def main() -> int:
    clf = ClassificadorE8(RAIZ / "backend" / "model")
    clf.carregar()
    if not clf.estado.carregado:
        print(clf.estado.erro)
        return 1
    classes = clf.estado.classes
    imagens = json.loads((RAIZ / "data" / "imagens_jogos.json").read_text(encoding="utf-8"))["imagens"]
    imagens = [i for i in imagens if i.get("origem") != "placeholder"]

    resultados: dict[str, list[tuple[str, str]]] = {}
    for modo in ClassificadorE8.MODOS_TTA:
        res = []
        for img in imagens:
            dados = (RAIZ / "data" / "imagens_jogos" / img["caminho"]).read_bytes()
            p = clf.probabilidades(dados, modo)
            res.append((img["classe"], classes[int(np.argmax(p))]))
        resultados[modo] = res

    print(f"{'modo':<14} {'acuracia':>8}  " + "  ".join(f"{a}<->{b}" for a, b in PARES))
    for modo, res in resultados.items():
        acc = sum(v == p for v, p in res) / len(res)
        conf = []
        for a, b in PARES:
            n = sum((v, p) in [(a, b), (b, a)] for v, p in res)
            conf.append(f"{n:>3} trocas")
        print(f"{modo:<14} {acc:>8.3f}  " + "  ".join(conf))
    return 0


if __name__ == "__main__":
    sys.exit(main())
