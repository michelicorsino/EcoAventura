"""Cadastra as fotografias dos jogos em data/imagens_jogos.json.

Uso (a partir de ecoaventura/):
    backend/.venv/Scripts/python -I ferramentas/registrar_imagens.py

O que faz:
1. Varre data/imagens_jogos/<classe>/ (jpg, jpeg, png, webp).
2. A classe verdadeira é a PASTA onde a foto está (rótulo humano).
3. Calcula sha256 e dHash 64 bits e compara com o manifesto do dataset
   original (ferramentas/referencia_treino/manifesto_final.csv) para
   garantir que a foto NÃO faz parte de treino/validação/teste.
4. Preserva campos de revisão já preenchidos (revisada, revisado_por,
   origem, observacoes) quando o arquivo já estava no manifesto.
5. Mostra o balanceamento por classe (mínimo exigido: 4 por classe).

Revisão manual: depois de conferir cada foto, edite o manifesto e marque
"revisada": true, "revisado_por": "<nome>", "origem": "gerada_ia:<ferramenta>"
ou "fotografia_propria", etc. Rode este script de novo para validar.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "data" / "imagens_jogos"
MANIFESTO = RAIZ / "data" / "imagens_jogos.json"
REFERENCIA = Path(__file__).resolve().parent / "referencia_treino" / "manifesto_final.csv"
CLASSES = [
    "battery", "biological", "brown-glass", "cardboard", "clothes", "green-glass",
    "metal", "paper", "plastic", "shoes", "trash", "white-glass",
]
EXTENSOES = {".jpg", ".jpeg", ".png", ".webp"}
MINIMO_POR_CLASSE = 4
LIMIAR_DHASH = 4  # distância de Hamming <= 4 => possível duplicata do dataset


def dhash(caminho: Path) -> str:
    with Image.open(caminho) as im:
        g = im.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        px = list(g.tobytes())
    bits = []
    for linha in range(8):
        for col in range(8):
            bits.append("1" if px[linha * 9 + col] > px[linha * 9 + col + 1] else "0")
    return "".join(bits)


def hamming(a: str, b: str) -> int:
    return sum(x != y for x, y in zip(a, b))


def carregar_referencia() -> tuple[set[str], list[tuple[str, str]]]:
    if not REFERENCIA.exists():
        print("AVISO: manifesto do dataset original ausente; verificação de vazamento desativada.")
        return set(), []
    shas, hashes = set(), []
    with REFERENCIA.open(encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            shas.add(linha["sha256"])
            if linha.get("dhash"):
                hashes.append((linha["dhash"], linha["relative_path"]))
    return shas, hashes


def main() -> int:
    anterior = {}
    if MANIFESTO.exists():
        for img in json.loads(MANIFESTO.read_text(encoding="utf-8")).get("imagens", []):
            anterior[img["caminho"]] = img

    shas_treino, dhashes_treino = carregar_referencia()
    usados_ids = {i["id"] for i in anterior.values() if i.get("id")}
    imagens, problemas = [], []

    for classe in CLASSES:
        pasta = PASTA / classe
        pasta.mkdir(parents=True, exist_ok=True)
        arquivos = sorted(p for p in pasta.iterdir() if p.suffix.lower() in EXTENSOES)
        for arq in arquivos:
            rel = f"{classe}/{arq.name}"
            dados = arq.read_bytes()
            sha = hashlib.sha256(dados).hexdigest()
            try:
                with Image.open(arq) as im:
                    largura, altura = im.size
                dh = dhash(arq)
            except Exception as exc:  # noqa: BLE001
                problemas.append(f"{rel}: não abre ({exc})")
                continue

            reg = dict(anterior.get(rel, {}))
            if reg.get("classe") and reg["classe"] != classe:
                problemas.append(f"{rel}: classe do manifesto ({reg['classe']}) != pasta ({classe}); usando a pasta")
            if "id" not in reg:
                n = 1
                while f"{classe}_{n:03d}" in usados_ids:
                    n += 1
                reg["id"] = f"{classe}_{n:03d}"
                usados_ids.add(reg["id"])

            menor = min((hamming(dh, h) for h, _ in dhashes_treino), default=None)
            vazou_sha = sha in shas_treino
            suspeita = vazou_sha or (menor is not None and menor <= LIMIAR_DHASH)
            if vazou_sha:
                problemas.append(f"{rel}: IDÊNTICA a uma imagem do dataset original — remova")
            elif suspeita:
                problemas.append(f"{rel}: muito parecida com o dataset original (dHash {menor}) — confira")
            if min(largura, altura) < 128:
                problemas.append(f"{rel}: resolução baixa ({largura}x{altura}); mínimo recomendado 256 px")

            imagens.append({
                "id": reg["id"],
                "classe": classe,
                "caminho": rel,
                "origem": reg.get("origem", "a_definir"),
                "revisada": bool(reg.get("revisada", False)),
                "revisado_por": reg.get("revisado_por"),
                "data_revisao": reg.get("data_revisao"),
                "observacoes": reg.get("observacoes", ""),
                "largura": largura,
                "altura": altura,
                "sha256": sha,
                "dhash": dh,
                "verificacao_dataset_original": {
                    "sha256_igual": vazou_sha,
                    "menor_distancia_dhash": menor,
                    "suspeita_vazamento": suspeita,
                },
                "usar_para_treino": False,
            })

    # Duplicatas dentro da própria base dos jogos
    vistos: dict[str, str] = {}
    for img in imagens:
        if img["sha256"] in vistos:
            problemas.append(f"{img['caminho']}: duplicata de {vistos[img['sha256']]}")
        vistos[img["sha256"]] = img["caminho"]

    manifesto = {
        "descricao": "Base complementar dos jogos EcoAventura. Imagens NÃO usadas no treino/validação/teste da CNN E8.",
        "regra": "Não usar estas imagens para alterar os pesos da CNN sem registrar um novo experimento.",
        "rotulo_verdadeiro": "Definido pela pasta e conferido manualmente (campo 'revisada').",
        "atualizado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(imagens),
        "imagens": imagens,
    }
    MANIFESTO.write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Manifesto salvo: {MANIFESTO} ({len(imagens)} imagens)\n")
    print(f"{'classe':<12} {'total':>5} {'revis.':>6} {'provis.':>7}")
    faltam = False
    for c in CLASSES:
        da = [i for i in imagens if i["classe"] == c]
        reais = [i for i in da if i["origem"] != "placeholder"]
        rev = sum(1 for i in reais if i["revisada"])
        prov = len(da) - len(reais)
        marca = "" if len(reais) >= MINIMO_POR_CLASSE else "  <- faltam fotos reais"
        faltam |= bool(marca)
        print(f"{c:<12} {len(da):>5} {rev:>6} {prov:>7}{marca}")
    if problemas:
        print("\nProblemas encontrados:")
        for p in problemas:
            print(" -", p)
    if faltam:
        print("\nAinda faltam fotografias reais para cumprir 4 por classe.")
    return 1 if any("IDÊNTICA" in p for p in problemas) else 0


if __name__ == "__main__":
    sys.exit(main())
