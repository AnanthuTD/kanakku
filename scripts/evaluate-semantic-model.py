"""Evaluate the pinned, bundled semantic classifier on separate synthetic inputs.

    .venv/bin/python scripts/evaluate-semantic-model.py

Requires numpy/onnxruntime. Runs fully offline, does not regenerate prototypes,
fit thresholds or fail merely because a synthetic prediction is wrong. Fixture,
asset and routing integrity errors do fail. Detailed results land in artifacts.
This is a diagnostic, not population accuracy or an Android latency benchmark.
"""
import argparse
import hashlib
import json
import re
import runpy
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "modules/kanakku-native/android/src/main/assets/kanakku"
CATEGORIES = {
    "Food & dining", "Groceries", "Transport", "Shopping", "Bills & utilities",
    "Entertainment", "Health", "Home",
}
POLICIES = {
    "automatic_merchant": {"similarity": .58, "margin": .15, "kind": "merchant"},
    "editable_note_suggestion": {"similarity": .30, "margin": .055, "kind": "context"},
}


def percent(numerator, denominator):
    return round(100 * numerator / denominator, 2) if denominator else None


def evaluate(rows, threshold, kind=None):
    rows = [r for r in rows if kind is None or r["kind"] == kind]
    scored = [{**r, "accepted": r["similarity"] >= threshold["similarity"]
               and r["margin"] >= threshold["margin"]} for r in rows]
    labeled = [r for r in scored if r["expected"] is not None]
    accepted = [r for r in scored if r["accepted"]]
    correct = sum(r["expected"] == r["top_category"] for r in accepted)
    routing_correct = sum(
        (r["top_category"] if r["accepted"] else None) == r["expected"]
        for r in scored
    )
    confusion = {}
    for r in scored:
        expected = r["expected"] or "Needs review"
        output = r["top_category"] if r["accepted"] else "Needs review"
        confusion.setdefault(expected, {}).setdefault(output, 0)
        confusion[expected][output] += 1
    return {
        "total": len(scored), "unambiguous": len(labeled),
        "top1_correct_unambiguous": sum(r["top_category"] == r["expected"] for r in labeled),
        "top1_accuracy_unambiguous_percent": percent(
            sum(r["top_category"] == r["expected"] for r in labeled), len(labeled)),
        "accepted": len(accepted), "accepted_correct": correct,
        "accepted_precision_percent": percent(correct, len(accepted)),
        "review_count": len(scored) - len(accepted),
        "review_rate_percent": percent(len(scored) - len(accepted), len(scored)),
        "routing_correct": routing_correct,
        "routing_accuracy_percent": percent(routing_correct, len(scored)),
        "ambiguous_false_accepts": sum(r["expected"] is None for r in accepted),
        "confusion": confusion,
        "false_accepts": [r for r in accepted if r["top_category"] != r["expected"]],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, default=ROOT / "tests/model/semantic-heldout.json")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/semantic-evaluation")
    args = parser.parse_args()
    fixtures = json.loads(args.fixtures.read_text())
    cases = fixtures["cases"]
    prototypes = json.loads((ASSETS / "prototypes.json").read_text())
    prototype_texts = {re.sub(r"\s+", " ", r["text"].strip().lower()) for r in prototypes}
    ids, texts = set(), set()
    for case in cases:
        normalized = re.sub(r"\s+", " ", case["text"].strip().lower())
        assert case["id"] not in ids and normalized not in texts, "Duplicate fixture"
        assert normalized not in prototype_texts, "Prototype leaked into held-out fixtures"
        assert case["expected"] in CATEGORIES | {None}, "Unknown gold category"
        assert case["kind"] in {"merchant", "context"}, "Unknown input stratum"
        assert len(case["text"]) <= 300 and all(len(t) <= 100 for t in re.findall(r"\w+", case["text"])), "Fixture exceeds native tokenizer bounds"
        ids.add(case["id"])
        texts.add(normalized)
    # Fail if the production routing thresholds change without updating this
    # evaluation. Similarities and margins are not calibrated probabilities.
    native = (ROOT / "modules/kanakku-native/android/src/main/java/expo/modules/kanakku/SemanticClassifier.kt").read_text()
    review = (ROOT / "src/components/ReviewSheet.tsx").read_text()
    assert re.search(r"s\.similarity\s*>=\s*\.58\s*&&\s*s\.margin\s*>=\s*\.15", native)
    assert re.search(r"result\.similarity\s*>=\s*0\.3\b", review)
    assert re.search(r"result\.margin\s*>=\s*0\.055\b", review)
    model = runpy.run_path(str(ROOT / "scripts/prepare-semantic-model.py"))
    rows, elapsed = [], []
    for case in cases:
        start = time.perf_counter()
        vector = model["embed"](case["text"])
        elapsed.append((time.perf_counter() - start) * 1000)
        scores = {}
        for proto in prototypes:
            scores[proto["category"]] = max(scores.get(proto["category"], -1),
                                             float(np.dot(vector, proto["embedding"])))
        ranking = sorted(scores.items(), key=lambda item: -item[1])
        rows.append({**case, "top_category": ranking[0][0],
                     "similarity": ranking[0][1],
                     "margin": ranking[0][1] - ranking[1][1],
                     "ranking": dict(ranking)})
    summaries = {name: evaluate(rows, policy, policy["kind"])
                 for name, policy in POLICIES.items()}
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    report = {
        "dataset": fixtures["description"], "fixture_count": len(cases),
        "fixture_sha256": sha(args.fixtures), "model_sha256": sha(ASSETS / "minilm.onnx"),
        "prototypes_sha256": sha(ASSETS / "prototypes.json"),
        "policies": POLICIES, "summaries": summaries,
        "desktop_inference_ms": {"median": float(np.median(elapsed)), "p95": float(np.percentile(elapsed, 95))},
        "limitations": [
            "Synthetic hand-authored cases, not representative real bank/merchant data.",
            "Held out from app prototypes, not proven absent from model pretraining.",
            "One small convenience set gives unstable precision/coverage estimates.",
            "Semantic stage only; personal rules and known merchant mappings are not measured.",
            "English notes only; Malayalam transcription/translation quality is not measured.",
            "The suggestions are user-confirmed; automatic acceptance uses separate stricter thresholds.",
            "Scores/margins are heuristics, not probabilities; no threshold fitting was performed.",
            "Desktop ONNX/tokenizer path, not Android throughput/memory/battery or production population accuracy.",
        ], "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    lines = ["# Offline semantic category evaluation", "", fixtures["description"], "",
             f"Evaluated {len(cases)} distinct inputs against the existing pinned model/prototypes without modifying either.", "",
             "| Production route | Inputs | Top-1 accuracy on unambiguous labels | Accepted precision | Review rate | Ambiguous false accepts |",
             "|---|---:|---:|---:|---:|---:|"]
    for name, summary in summaries.items():
        lines.append(f"| {name.replace('_', ' ')} | {summary['total']} | {summary['top1_accuracy_unambiguous_percent']}% | {summary['accepted_precision_percent']}% ({summary['accepted_correct']}/{summary['accepted']}) | {summary['review_rate_percent']}% | {summary['ambiguous_false_accepts']} |")
    lines += ["", "Accepted precision includes ambiguous inputs as incorrect acceptances. Top-1 accuracy excludes ambiguous inputs; review rate includes them. Note suggestions are editable and require Save, while merchant acceptance can bypass review.", "", "## Incorrect accepted outputs", ""]
    for name, summary in summaries.items():
        lines.append(f"### {name.replace('_', ' ')}")
        lines.append("")
        if not summary["false_accepts"]:
            lines.append("No incorrect accepts in this small set. This does not establish production safety.")
        for row in summary["false_accepts"]:
            lines.append(f"- `{row['id']}`: {row['text']} → {row['top_category']}; expected {row['expected'] or 'review'} (similarity {row['similarity']:.3f}, margin {row['margin']:.3f}).")
        lines.append("")
    lines += ["## Interpretation and limitations", ""]
    lines += [f"- {limitation}" for limitation in report["limitations"]]
    lines += ["", f"Desktop-only inference median {report['desktop_inference_ms']['median']:.1f} ms, p95 {report['desktop_inference_ms']['p95']:.1f} ms; model initialization excluded. Do not substitute these for an Android benchmark.", "", "Collect consented, redacted real merchant examples with independent purpose labels before claiming broad accuracy or changing thresholds. Keep an untouched test split distinct from any future tuning set."]
    args.output.with_suffix(".md").write_text("\n".join(lines) + "\n")
    for name, summary in summaries.items():
        print(name, json.dumps({k: v for k, v in summary.items() if k not in {"confusion", "false_accepts"}}))
    print("Report:", args.output.with_suffix(".md"))


if __name__ == "__main__":
    main()
