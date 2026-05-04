#!/usr/bin/env python3
"""
Batch-geocode all unique addresses from output/combined/address_index.json
via PDOK Locatieserver. Results to output/geocoded/addresses.json.

Resumable: existing entries in addresses.json are skipped.
Polite rate: ~10 req/s.

Run: .venv/bin/python scripts/geocode_addresses.py
Flags:
  --limit N    geocode at most N new addresses (test runs)
  --retry-failed  re-attempt addresses previously logged as no_match
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parent.parent
ADDRESS_INDEX = ROOT / "output" / "combined" / "address_index.json"
OUT_PATH = ROOT / "output" / "geocoded" / "addresses.json"
PDOK_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("geocode")


def normalize_for_pdok(raw: str) -> str | None:
    """
    Reduce a messy address key like 'jong (t. de), verloren visscherstr. 2'
    to a PDOK-friendly query like 'verloren visscherstr 2'. Returns None if
    no usable street+number can be extracted.
    """
    s = raw.strip()
    # Strip parentheticals
    s = re.sub(r"\([^)]*\)", " ", s)
    # If multiple comma-separated parts, prefer the part containing a digit
    if "," in s:
        parts = [p.strip() for p in s.split(",") if p.strip()]
        digit_parts = [p for p in parts if re.search(r"\d", p)]
        s = digit_parts[-1] if digit_parts else parts[-1]
    # Multi-target with " en "
    if " en " in s:
        s = s.split(" en ")[0].strip()
    # Strip trailing 'none'
    s = re.sub(r"\s+none\s*$", "", s)
    # Range "5-7" → "5"
    s = re.sub(r"(\d+)\s*-\s*\d+[a-z]?", r"\1", s)
    # Strip stray punctuation
    s = re.sub(r"[\.;]+\s*$", "", s).strip()
    if not s:
        return None
    if not re.search(r"\d", s):
        # No number: defer to street-only geocoding (separate phase if needed)
        return None
    return s


def geocode_one(query: str, timeout: float = 5.0) -> dict | None:
    """Single PDOK call. Returns {lat,lng,score,matched,type} or None on no match."""
    params = {
        "q": f"{query}, Groningen",
        "fq": "type:adres",
        "rows": 1,
    }
    url = f"{PDOK_URL}?{urlencode(params)}"
    try:
        req = Request(url, headers={"User-Agent": "groningen-adresboek-1926/0.1"})
        with urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"_error": str(e)}
    docs = data.get("response", {}).get("docs", [])
    if not docs:
        return None
    doc = docs[0]
    point = doc.get("centroide_ll", "")
    m = re.match(r"POINT\(([\d.\-]+)\s+([\d.\-]+)\)", point)
    if not m:
        return None
    lng, lat = float(m.group(1)), float(m.group(2))
    return {
        "lat": lat,
        "lng": lng,
        "score": doc.get("score"),
        "matched": doc.get("weergavenaam"),
        "type": doc.get("type"),
    }


def load_existing() -> dict:
    if OUT_PATH.exists():
        try:
            return json.loads(OUT_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning(f"existing geocoded file unreadable ({e}); starting fresh")
    return {}


def save_atomic(payload: dict) -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT_PATH)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="cap new geocodes (0 = no limit)")
    ap.add_argument("--retry-failed", action="store_true", help="re-try previous no_match entries")
    ap.add_argument("--workers", type=int, default=20, help="parallel HTTP workers (default 20)")
    args = ap.parse_args()

    addresses = json.loads(ADDRESS_INDEX.read_text(encoding="utf-8"))
    keys = sorted(addresses.keys())
    log.info(f"Loaded {len(keys)} unique addresses")

    out = load_existing()
    log.info(f"Resuming: {len(out)} addresses already attempted")

    # Build work list (pre-normalize so no_number cases bypass the worker pool)
    todo: list[tuple[str, str]] = []  # (key, query)
    for k in keys:
        if k in out:
            entry = out[k]
            if not args.retry_failed:
                continue
            if entry.get("status") not in ("no_match", "error"):
                continue
        q = normalize_for_pdok(k)
        if q is None:
            out[k] = {"status": "no_number"}
            continue
        todo.append((k, q))
        if args.limit and len(todo) >= args.limit:
            break

    log.info(f"Queued {len(todo)} addresses for PDOK lookup ({args.workers} workers)")
    new_hits = new_misses = new_errors = 0
    processed = 0
    lock = threading.Lock()
    t0 = time.time()

    def worker(item: tuple[str, str]) -> tuple[str, dict]:
        k, q = item
        result = geocode_one(q)
        if result is None:
            return k, {"status": "no_match", "query": q}
        if "_error" in result:
            return k, {"status": "error", "query": q, "error": result["_error"]}
        return k, {"status": "ok", "query": q, **result}

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(worker, item): item for item in todo}
        for fut in as_completed(futures):
            k, entry = fut.result()
            with lock:
                out[k] = entry
                processed += 1
                status = entry.get("status")
                if status == "ok":
                    new_hits += 1
                elif status == "no_match":
                    new_misses += 1
                else:
                    new_errors += 1
                if processed % 500 == 0:
                    save_atomic(out)
                    elapsed = time.time() - t0
                    rate = processed / elapsed if elapsed else 0
                    log.info(
                        f"  [{processed}/{len(todo)}] ok={new_hits} miss={new_misses} "
                        f"err={new_errors} ({rate:.1f} req/s)"
                    )

    new_skipped = sum(1 for v in out.values() if v.get("status") == "no_number")

    save_atomic(out)
    elapsed = time.time() - t0
    log.info("=" * 60)
    log.info(f"Done in {elapsed:.0f}s ({processed} processed)")
    log.info(f"  hits:        {new_hits}")
    log.info(f"  no_match:    {new_misses}")
    log.info(f"  no_number:   {new_skipped}")
    log.info(f"  errors:      {new_errors}")
    total_ok = sum(1 for v in out.values() if v.get("status") == "ok")
    log.info(f"  cumulative ok: {total_ok}/{len(out)} ({100*total_ok/max(len(out),1):.1f}%)")
    log.info(f"  output:      {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
