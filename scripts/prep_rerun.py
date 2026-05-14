#!/usr/bin/env python3
"""Prepare flagged pages for re-processing by the pipeline.

Removes the cached LLM artefacts for each stem in rerun_stems.txt and
strips those scan filenames from output/checkpoint.json so that the
next `python -m pipeline.run_pipeline` invocation will re-OCR / re-LLM
exactly that subset. OCR cache stays — only the LLM stage is invalidated.

Usage:
    python scripts/prep_rerun.py /path/to/rerun_stems.txt [output_dir]

Defaults output_dir to _pipeline/output relative to repo root.
Idempotent. Prints a dry-run summary first; pass --apply to mutate.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO / "_pipeline" / "output"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("stems_file", type=Path)
    ap.add_argument("output_dir", type=Path, nargs="?", default=DEFAULT_OUTPUT)
    ap.add_argument("--apply", action="store_true", help="Actually delete + edit checkpoint")
    args = ap.parse_args()

    stems = [s.strip() for s in args.stems_file.read_text().splitlines() if s.strip()]
    if not stems:
        sys.exit("No stems in input file.")

    llm_raw = args.output_dir / "llm_raw"
    json_dir = args.output_dir / "json"
    usage_dir = args.output_dir / "llm_usage"
    failures_dir = args.output_dir / "failures"
    checkpoint_path = args.output_dir / "checkpoint.json"

    to_delete: list[Path] = []
    for stem in stems:
        for d in (llm_raw, json_dir, usage_dir, failures_dir):
            p = d / f"{stem}.json"
            if p.exists():
                to_delete.append(p)

    checkpoint = json.loads(checkpoint_path.read_text()) if checkpoint_path.exists() else {}
    completed = checkpoint.get("completed", [])
    failed = checkpoint.get("failed", [])
    scan_names = {f"{s}.jpg" for s in stems}
    remove_completed = [c for c in completed if c in scan_names]
    remove_failed = [f for f in failed if f in scan_names]

    print(f"Stems to re-run: {len(stems)}")
    print(f"  files to delete: {len(to_delete)}")
    print(f"  checkpoint completed entries to drop: {len(remove_completed)}")
    print(f"  checkpoint failed entries to drop: {len(remove_failed)}")
    if not args.apply:
        print("\nDry run. Re-invoke with --apply to mutate.")
        return 0

    for p in to_delete:
        p.unlink()
    checkpoint["completed"] = [c for c in completed if c not in scan_names]
    checkpoint["failed"] = [f for f in failed if f not in scan_names]
    checkpoint_path.write_text(json.dumps(checkpoint, indent=2))
    print(f"\nApplied: {len(to_delete)} files deleted, "
          f"{len(remove_completed)+len(remove_failed)} checkpoint entries dropped.")
    print("Now run: cd _pipeline && python -m pipeline.run_pipeline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
