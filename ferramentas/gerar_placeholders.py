"""Gera imagens PROVISÓRIAS (desenhos simples) para testar os jogos
enquanto as 48 fotografias reais não estiverem prontas.

Uso (a partir de ecoaventura/):
    backend/.venv/Scripts/python -I ferramentas/gerar_placeholders.py
    backend/.venv/Scripts/python -I ferramentas/registrar_imagens.py

Os arquivos se chamam placeholder_*.png e ficam com origem "placeholder".
Eles NÃO são fotografias e NÃO servem para avaliar a CNN — a previsão da
CNN sobre eles não tem significado. Apague-os quando as fotos reais
estiverem na pasta (ou rode com --remover).
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "data" / "imagens_jogos"
MANIFESTO = RAIZ / "data" / "imagens_jogos.json"
TAM = 512

FUNDOS = [(236, 232, 222), (214, 228, 236), (226, 236, 214), (240, 226, 214)]


def garrafa(d: ImageDraw.ImageDraw, cor, r: random.Random):
    x = 256 + r.randint(-40, 40)
    d.rounded_rectangle([x - 70, 200, x + 70, 450], 40, fill=cor)
    d.rectangle([x - 24, 110, x + 24, 210], fill=cor)
    d.rectangle([x - 28, 95, x + 28, 118], fill=tuple(max(0, c - 50) for c in cor[:3]))
    d.rectangle([x - 45, 230, x - 25, 420], fill=(255, 255, 255, 90))


def desenhar(classe: str, d: ImageDraw.ImageDraw, r: random.Random):
    if classe == "battery":
        y = r.randint(170, 230)
        d.rounded_rectangle([110, y, 380, y + 110], 20, fill=(40, 40, 40))
        d.rectangle([300, y, 380, y + 110], fill=(220, 160, 30))
        d.rectangle([380, y + 35, 400, y + 75], fill=(170, 170, 170))
    elif classe == "biological":
        d.ellipse([150, 160, 360, 380], fill=(200, 40, 40))
        d.rectangle([250, 120, 262, 175], fill=(90, 60, 30))
        d.ellipse([262, 120, 330, 160], fill=(60, 150, 50))
    elif classe == "brown-glass":
        garrafa(d, (110, 60, 20), r)
    elif classe == "green-glass":
        garrafa(d, (30, 120, 50), r)
    elif classe == "white-glass":
        garrafa(d, (210, 225, 230), r)
    elif classe == "cardboard":
        d.polygon([(120, 220), (390, 220), (420, 420), (90, 420)], fill=(180, 135, 80))
        d.polygon([(120, 220), (256, 160), (390, 220)], fill=(200, 155, 100))
        d.line([(256, 160), (256, 420)], fill=(150, 110, 60), width=6)
    elif classe == "clothes":
        d.polygon([(170, 140), (340, 140), (430, 220), (380, 260), (350, 230), (350, 420),
                   (160, 420), (160, 230), (130, 260), (80, 220)], fill=(50, 90, 170))
    elif classe == "metal":
        d.rounded_rectangle([180, 140, 330, 420], 18, fill=(170, 175, 180))
        d.ellipse([180, 120, 330, 165], fill=(200, 205, 210))
        d.rectangle([180, 230, 330, 330], fill=(190, 40, 40))
    elif classe == "paper":
        for i in range(3):
            o = i * 14
            d.rectangle([140 + o, 120 + o, 380 + o, 420 + o], fill=(250, 250, 248), outline=(200, 200, 200))
        for y in range(170, 400, 30):
            d.line([(180, y), (390, y)], fill=(170, 190, 220), width=3)
    elif classe == "plastic":
        x = 256
        d.rounded_rectangle([x - 60, 190, x + 60, 450], 50, fill=(120, 190, 235))
        d.rectangle([x - 22, 120, x + 22, 200], fill=(120, 190, 235))
        d.rectangle([x - 26, 100, x + 26, 125], fill=(30, 100, 200))
        d.rectangle([x - 60, 270, x + 60, 330], fill=(240, 120, 40))
    elif classe == "shoes":
        d.polygon([(90, 330), (120, 230), (220, 230), (300, 290), (420, 310), (430, 370), (90, 370)],
                  fill=(150, 70, 40))
        d.rectangle([90, 365, 430, 390], fill=(240, 240, 240))
    elif classe == "trash":
        for _ in range(9):
            x, y = r.randint(130, 360), r.randint(150, 370)
            d.polygon([(x, y), (x + r.randint(30, 80), y + r.randint(-20, 30)),
                       (x + r.randint(10, 60), y + r.randint(40, 80))],
                      fill=(r.randint(90, 160), r.randint(90, 140), r.randint(80, 130)))


def main() -> int:
    if "--remover" in sys.argv:
        n = 0
        for p in PASTA.glob("*/placeholder_*.png"):
            p.unlink()
            n += 1
        print(f"{n} placeholders removidos. Rode registrar_imagens.py para atualizar o manifesto.")
        return 0

    r = random.Random(7)
    origens = {}
    for classe in sorted(p.name for p in PASTA.iterdir() if p.is_dir()):
        for i in range(1, 5):
            img = Image.new("RGB", (TAM, TAM), r.choice(FUNDOS))
            d = ImageDraw.Draw(img, "RGBA")
            d.ellipse([90, 400, 430, 470], fill=(0, 0, 0, 40))  # sombra
            desenhar(classe, d, r)
            img = img.rotate(r.uniform(-12, 12), fillcolor=FUNDOS[0], resample=Image.Resampling.BICUBIC)
            img = img.filter(ImageFilter.GaussianBlur(0.6))
            nome = f"placeholder_{i}.png"
            img.save(PASTA / classe / nome)
            origens[f"{classe}/{nome}"] = "placeholder"

    # Marca a origem no manifesto para o registrar_imagens.py preservar
    dados = json.loads(MANIFESTO.read_text(encoding="utf-8")) if MANIFESTO.exists() else {"imagens": []}
    existentes = {i["caminho"]: i for i in dados.get("imagens", [])}
    for caminho in origens:
        classe = caminho.split("/")[0]
        existentes.setdefault(caminho, {"caminho": caminho, "classe": classe})
        existentes[caminho]["origem"] = "placeholder"
        existentes[caminho]["observacoes"] = "Desenho provisório para testes — não é fotografia."
    dados["imagens"] = list(existentes.values())
    MANIFESTO.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(origens)} imagens provisórias geradas em {PASTA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
