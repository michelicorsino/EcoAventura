"""Recorta as 48 fotografias da grade enviada pela equipe (4 colunas x 12 linhas,
uma linha por classe, com o nome da classe escrito embaixo de cada foto).

Cada recorte contém SÓ a fotografia (sem a legenda, sem a moldura clara e sem
as faixas de outras imagens que aparecem coladas em algumas bordas).

Uso (a partir de ecoaventura/):
    backend/.venv/Scripts/python -I ferramentas/recortar_grade.py [grade.webp] [--previa saida.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
GRADE = Path(__file__).resolve().parent / "fonte_imagens" / "grade_48_imagens.webp"
DESTINO = RAIZ / "data" / "imagens_jogos"
CLASSES = [
    "battery", "biological", "brown-glass", "cardboard", "clothes", "green-glass",
    "metal", "paper", "plastic", "shoes", "trash", "white-glass",
]
COLUNAS = 4


def segmentos(ativo: np.ndarray, minimo: int) -> list[tuple[int, int]]:
    """Trechos contínuos True de um vetor booleano (início, fim exclusivo)."""
    seg, ini = [], None
    for i, v in enumerate(list(ativo) + [False]):
        if v and ini is None:
            ini = i
        elif not v and ini is not None:
            if i - ini >= minimo:
                seg.append((ini, i))
            ini = None
    return seg


def caixa_da_foto(cel: np.ndarray) -> tuple[int, int, int, int]:
    """Maior bloco "de foto" dentro da célula: (x0, y0, x1, y1)."""
    fundo = np.array([245, 248, 245])
    dif = np.abs(cel.astype(int) - fundo).max(axis=2)
    # pixels que não são fundo nem moldura clara (cinza muito claro)
    foto = dif > 22
    linhas = foto.mean(axis=1) > 0.45
    ys = segmentos(linhas, 30)
    y0, y1 = max(ys, key=lambda s: s[1] - s[0])  # bloco mais alto (a legenda é baixa)
    colunas = foto[y0:y1].mean(axis=0) > 0.5
    xs = segmentos(colunas, 30)
    x0, x1 = max(xs, key=lambda s: s[1] - s[0])

    # Remove faixas de outras imagens coladas na borda: procura "costuras"
    # (linha/coluna clara e uniforme, bem mais clara que o resto) nos 30% de
    # cada borda e fica com a parte interna. Depois tira linhas uniformes da borda.
    bloco = cel[y0:y1, x0:x1].astype(int).mean(axis=2)

    def cortar(perfil_m: np.ndarray, perfil_d: np.ndarray) -> tuple[int, int]:
        n = len(perfil_m)
        med = float(np.median(perfil_m))
        def local(i: int) -> bool:
            # mais clara que os vizinhos dos DOIS lados (costura fina entre duas imagens)
            esq = perfil_m[max(0, i - 3) : i]
            dir_ = perfil_m[i + 1 : i + 4]
            return bool(len(esq) and len(dir_) and perfil_m[i] - esq.mean() > 30 and perfil_m[i] - dir_.mean() > 30)

        costura = [
            i
            for i in range(n)
            if (perfil_d[i] < 26 and perfil_m[i] > 180 and perfil_m[i] - med > 45)
            or (perfil_d[i] < 30 and perfil_m[i] > 150 and (i < n * 0.15 or i > n * 0.85) and local(i))
        ]
        ini = max([c for c in costura if c < n * 0.3], default=-1) + 1
        fim = min([c for c in costura if c > n * 0.7], default=n)
        # linhas finas e uniformes que sobram na borda (ex.: fio verde da imagem vizinha)
        for _ in range(4):
            if perfil_d[ini] < 16:
                ini += 1
            if perfil_d[fim - 1] < 16:
                fim -= 1
        return ini, fim

    cx0, cx1 = cortar(bloco.mean(axis=0), bloco.std(axis=0))
    cy0, cy1 = cortar(bloco.mean(axis=1), bloco.std(axis=1))
    m = 2  # margem contra o serrilhado da borda
    return x0 + cx0 + m, y0 + cy0 + m, x0 + cx1 - m, y0 + cy1 - m


def main() -> int:
    brutos = sys.argv[1:]
    if "--previa" in brutos:
        i = brutos.index("--previa")
        brutos = brutos[:i] + brutos[i + 2 :]
    args = [a for a in brutos if not a.startswith("--")]
    grade = Path(args[0]) if args else GRADE
    img = Image.open(grade).convert("RGB")
    a = np.asarray(img)
    altura_linha = a.shape[0] / len(CLASSES)
    largura_col = a.shape[1] / COLUNAS

    recortes = []
    for r, classe in enumerate(CLASSES):
        for c in range(COLUNAS):
            cx0, cy0 = int(c * largura_col), int(r * altura_linha)
            cel = a[cy0 : int((r + 1) * altura_linha), cx0 : int((c + 1) * largura_col)]
            x0, y0, x1, y1 = caixa_da_foto(cel)
            rec = img.crop((cx0 + x0, cy0 + y0, cx0 + x1, cy0 + y1))
            pasta = DESTINO / classe
            pasta.mkdir(parents=True, exist_ok=True)
            nome = pasta / f"{classe}_{c + 1}.png"  # PNG: sem nova perda de compressão
            rec.save(nome)
            recortes.append((classe, c + 1, rec))
            print(f"{classe:<12} {c + 1}: {rec.size[0]}x{rec.size[1]}")

    if "--previa" in sys.argv:
        saida = Path(sys.argv[sys.argv.index("--previa") + 1])
        tw, th = 150, 120
        prev = Image.new("RGB", (COLUNAS * (tw + 6), len(CLASSES) * (th + 6)), "white")
        for i, (_, _, rec) in enumerate(recortes):
            r = rec.copy()
            r.thumbnail((tw, th))
            prev.paste(r, ((i % COLUNAS) * (tw + 6), (i // COLUNAS) * (th + 6)))
        prev.save(saida)
    return 0


if __name__ == "__main__":
    sys.exit(main())
