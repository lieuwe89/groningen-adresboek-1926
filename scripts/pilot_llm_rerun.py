#!/usr/bin/env python3
"""Pilot a single page through OpenRouter with the new model.

Reads existing hOCR + scan + the project's street_register.txt prompt
and POSTs to OpenRouter directly using stdlib only (no venv needed).
Reports new entry count vs OCR word count so we can eyeball whether
the model swap actually catches the col-3 block that 2.5-flash-lite
dropped on page 0633.

Usage:
    python3 scripts/pilot_llm_rerun.py <stem> [model_slug]
e.g.
    python3 scripts/pilot_llm_rerun.py 1769_19525-1926_0633 \\
        google/gemini-3.1-flash-lite
"""

from __future__ import annotations

import base64
import json
import re
import sys
import urllib.request
from pathlib import Path

REPO = Path("/Users/lieuwejongsma/projects/groningen-adresboek-1926")
HOCR_DIR = REPO / "_pipeline/output/hocr"
SCANS_DIR = REPO / "_pipeline/scans"
PROMPTS_DIR = REPO / "_pipeline/pipeline/prompts"
CONFIG_LOCAL = REPO / "_pipeline/pipeline/config_local.py"
OUT_DIR = Path.home() / "Documents/claude-output"


def load_api_key() -> str:
    txt = CONFIG_LOCAL.read_text()
    m = re.search(r'OPENROUTER_API_KEY\s*=\s*"([^"]+)"', txt)
    if not m:
        sys.exit("OPENROUTER_API_KEY not found in config_local.py")
    return m.group(1)


def build_word_list(hocr_path: Path) -> tuple[str, int]:
    data = json.loads(hocr_path.read_text())
    lines = []
    n = 0
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            for w in line.get("words", []):
                lines.append(f"{w['id']}: {w['text']}")
                n += 1
    return "\n".join(lines), n


def pick_prompt(stem: str) -> Path:
    # Simple: assume street_register for the canonical 0633 pilot.
    # Extend if piloting other section types.
    return PROMPTS_DIR / "street_register.txt"


def call_openrouter(api_key: str, model: str, prompt: str, image_path: Path) -> dict:
    image_b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 65536,
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://playground.lieuwejongsma.nl/groningen-1926",
            "X-Title": "groningen-adresboek-1926 pilot",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None


def summarise(parsed: dict) -> dict:
    streets = parsed.get("streets") or []
    summary = {
        "n_streets": len(streets),
        "streets": [],
        "total_entries": 0,
    }
    for s in streets:
        entries = s.get("entries") or []
        summary["streets"].append(
            {"street_name": s.get("street_name"), "n_entries": len(entries)}
        )
        summary["total_entries"] += len(entries)
    return summary


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    stem = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "google/gemini-3.1-flash-lite"
    api_key = load_api_key()
    hocr_path = HOCR_DIR / f"{stem}.ocr.json"
    image_path = SCANS_DIR / f"{stem}.jpg"
    for p in (hocr_path, image_path):
        if not p.exists():
            sys.exit(f"Missing: {p}")
    word_list, n_words = build_word_list(hocr_path)
    prompt_template = pick_prompt(stem).read_text()
    prompt = prompt_template.format(word_list=word_list)

    print(f"Pilot: stem={stem}  model={model}  ocr_words={n_words}")
    resp = call_openrouter(api_key, model, prompt, image_path)
    usage = resp.get("usage", {})
    print(
        f"Tokens: prompt={usage.get('prompt_tokens')} "
        f"completion={usage.get('completion_tokens')}"
    )
    content = resp["choices"][0]["message"]["content"]
    parsed = extract_json(content)
    if parsed is None:
        print("Failed to parse JSON. Raw head:", content[:500])
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    safe_model = model.replace("/", "_")
    out = OUT_DIR / f"pilot-{stem}-{safe_model}.json"
    out.write_text(json.dumps({"response": resp, "parsed": parsed}, indent=2))
    print(f"Saved {out}")

    summary = summarise(parsed)
    print("Summary:")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
