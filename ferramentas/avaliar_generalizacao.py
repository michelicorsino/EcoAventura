"""Avalia a CNN E8 nas fotografias NOVAS dos jogos (dados não vistos).

Uso (a partir de ecoaventura/):
    backend/.venv/Scripts/python -I ferramentas/avaliar_generalizacao.py [--incluir-nao-revisadas]

Gera data/relatorios/generalizacao_E8.json e generalizacao_E8.csv com
acurácia, F1 macro, métricas por classe e matriz de confusão — números
reais para a versão de apresentação. Placeholders são sempre ignorados.
Nenhum peso do modelo é alterado.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))

from inference import ClassificadorE8  # noqa: E402

PASTA_IMG = RAIZ / "data" / "imagens_jogos"
MANIFESTO = RAIZ / "data" / "imagens_jogos.json"
SAIDA = RAIZ / "data" / "relatorios"


def main() -> int:
    incluir_nao_rev = "--incluir-nao-revisadas" in sys.argv
    clf = ClassificadorE8(RAIZ / "backend" / "model")
    clf.carregar()
    if not clf.estado.carregado:
        print("Falha ao carregar o modelo:", clf.estado.erro)
        return 1
    classes = clf.estado.classes

    imagens = json.loads(MANIFESTO.read_text(encoding="utf-8"))["imagens"]
    imagens = [i for i in imagens if i.get("origem") != "placeholder"]
    if not incluir_nao_rev:
        imagens = [i for i in imagens if i.get("revisada")]
    if not imagens:
        print("Nenhuma fotografia real (e revisada) no manifesto. Use --incluir-nao-revisadas para testar.")
        return 1

    linhas = []
    for img in imagens:
        r = clf.classificar((PASTA_IMG / img["caminho"]).read_bytes())
        linhas.append({
            "id": img["id"], "caminho": img["caminho"], "classe_verdadeira": img["classe"],
            "classe_prevista": r["classe_prevista"], "confianca": r["confianca"],
            "acertou": r["classe_prevista"] == img["classe"], "tempo_ms": r["tempo_inferencia_ms"],
        })

    idx = {c: k for k, c in enumerate(classes)}
    matriz = [[0] * len(classes) for _ in classes]
    for l in linhas:
        matriz[idx[l["classe_verdadeira"]]][idx[l["classe_prevista"]]] += 1

    por_classe, f1s = {}, []
    for c in classes:
        k = idx[c]
        tp = matriz[k][k]
        fp = sum(matriz[j][k] for j in range(len(classes))) - tp
        fn = sum(matriz[k]) - tp
        p = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * p * rc / (p + rc) if p + rc else 0.0
        suporte = sum(matriz[k])
        por_classe[c] = {"precisao": p, "recall": rc, "f1": f1, "suporte": suporte}
        if suporte:
            f1s.append(f1)

    acc = sum(l["acertou"] for l in linhas) / len(linhas)
    relatorio = {
        "modelo": "E8",
        "tta": clf.modo_tta,
        "data": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "conjunto": "imagens novas dos jogos (fora de treino/validação/teste)",
        "somente_revisadas": not incluir_nao_rev,
        "quantidade_imagens": len(linhas),
        "acuracia": acc,
        "f1_macro": sum(f1s) / len(f1s) if f1s else 0.0,
        "tempo_medio_ms": sum(l["tempo_ms"] for l in linhas) / len(linhas),
        "por_classe": por_classe,
        "classes": classes,
        "matriz_confusao": matriz,
        "erros": [l for l in linhas if not l["acertou"]],
    }
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "generalizacao_E8.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")
    with (SAIDA / "generalizacao_E8.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        w.writeheader()
        w.writerows(linhas)

    print(f"TTA: {clf.modo_tta}  Imagens: {len(linhas)}  Acurácia: {acc:.3f}  F1 macro: {relatorio['f1_macro']:.3f}")
    for c, m in por_classe.items():
        if m["suporte"]:
            print(f"  {c:<12} acertos {matriz[idx[c]][idx[c]]}/{m['suporte']}  f1 {m['f1']:.2f}")
    print(f"Relatório: {SAIDA / 'generalizacao_E8.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
