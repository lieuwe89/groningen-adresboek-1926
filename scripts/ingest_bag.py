#!/usr/bin/env python3
"""
Ingest BAG (Basisregistratie Adressen en Gebouwen) from PDOK WFS for the
Groningen city bbox. Writes:

  output/bag/verblijfsobjecten.geojson  — VBO points with denormalised address
  output/bag/panden.geojson             — building polygons
  output/bag/buildings.geojson          — joined: pand polygon + addresses[]

Idempotent and resumable. Uses two paged WFS GetFeature calls (cap 1000 per
page). Resume token is the last successful startIndex per layer, persisted in
output/bag/_state.json.

Run:
  .venv/bin/python scripts/ingest_bag.py
"""
from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "bag"
STATE_PATH = OUT / "_state.json"
VBO_PATH = OUT / "verblijfsobjecten.geojson"
PAND_PATH = OUT / "panden.geojson"
JOINED_PATH = OUT / "buildings.geojson"

# Groningen city bbox (covers core 1926 city; outlier records will not match).
# Order for WFS BBOX in EPSG:4326 is (ymin, xmin, ymax, xmax) for axis-flipped
# CRSes — PDOK uses lat/lon order for EPSG:4326.
BBOX = (53.18, 6.50, 53.245, 6.65)

WFS = "https://service.pdok.nl/lv/bag/wfs/v2_0"
PAGE = 1000
TIMEOUT = 60
MAX_RETRIES = 5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest_bag")


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {}


def save_state(state: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def fetch_page(typename: str, start: int) -> dict:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": typename,
        "bbox": f"{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]},EPSG:4326",
        "count": PAGE,
        "startIndex": start,
        "outputFormat": "application/json",
    }
    last = None
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(WFS, params=params, timeout=TIMEOUT)
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
                time.sleep(2 ** attempt)
                continue
            return r.json()
        except Exception as e:  # noqa: BLE001
            last = str(e)
            time.sleep(2 ** attempt)
    raise RuntimeError(f"WFS fetch failed for {typename} start={start}: {last}")


PDOK_MAX_INDEX = 50000  # PDOK WFS hard cap on startIndex


def count_hits(typename: str, bbox: tuple[float, float, float, float]) -> int:
    import re
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": typename,
        "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]},EPSG:4326",
        "srsName": "EPSG:4326",
        "resultType": "hits",
    }
    r = requests.get(WFS, params=params, timeout=TIMEOUT)
    m = re.search(r'numberMatched="(\d+)"', r.text)
    if not m:
        raise RuntimeError(f"hits parse failed: {r.text[:200]}")
    return int(m.group(1))


def fetch_page_bbox(
    typename: str, bbox: tuple[float, float, float, float], start: int
) -> dict:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": typename,
        "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]},EPSG:4326",
        "srsName": "EPSG:4326",
        "count": PAGE,
        "startIndex": start,
        "outputFormat": "application/json",
    }
    last = None
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(WFS, params=params, timeout=TIMEOUT)
            if r.status_code != 200:
                last = f"HTTP {r.status_code}: {r.text[:200]}"
                time.sleep(2 ** attempt)
                continue
            return r.json()
        except Exception as e:  # noqa: BLE001
            last = str(e)
            time.sleep(2 ** attempt)
    raise RuntimeError(f"WFS fetch failed {typename} bbox={bbox} start={start}: {last}")


def quadsplit(bbox):
    ymin, xmin, ymax, xmax = bbox
    ymid = (ymin + ymax) / 2
    xmid = (xmin + xmax) / 2
    return [
        (ymin, xmin, ymid, xmid),
        (ymin, xmid, ymid, xmax),
        (ymid, xmin, ymax, xmid),
        (ymid, xmid, ymax, xmax),
    ]


def crawl(typename: str, out_path: Path, state_key: str, state: dict) -> int:
    """
    Recursively crawl `typename` within `BBOX`, splitting any sub-bbox whose
    feature count exceeds PDOK's startIndex cap. Dedupes by `identificatie`.

    Idempotency: writes a fresh file each run since the original line-append
    approach can't cleanly resume across the new tree-of-bboxes traversal.
    """
    OUT.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()

    seen: set[str] = set()
    n_written = 0

    def walk(bbox, depth=0):
        nonlocal n_written
        n = count_hits(typename, bbox)
        prefix = "  " * (depth + 1)
        if n > PDOK_MAX_INDEX:
            log.info(f"{prefix}{typename} bbox={bbox} → {n}, splitting")
            for sub in quadsplit(bbox):
                walk(sub, depth + 1)
            return
        log.info(f"{prefix}{typename} bbox={bbox} → {n} features")
        with out_path.open("a", encoding="utf-8") as fout:
            start = 0
            while start < n:
                data = fetch_page_bbox(typename, bbox, start)
                feats = data.get("features", [])
                if not feats:
                    break
                for f in feats:
                    ident = f.get("properties", {}).get("identificatie")
                    if ident and ident in seen:
                        continue
                    if ident:
                        seen.add(ident)
                    fout.write(json.dumps(f, ensure_ascii=False) + "\n")
                    n_written += 1
                start += len(feats)
                if start % 5000 == 0 or start >= n:
                    log.info(f"{prefix}  {start}/{n} (cumulative written: {n_written})")

    walk(BBOX)
    state[state_key] = n_written
    state[f"{state_key}_total"] = n_written
    save_state(state)
    return n_written


def join() -> int:
    """Build buildings.geojson by joining panden + verblijfsobjecten on pand id."""
    log.info("Joining VBOs into pand polygons...")

    pand_geom: dict[str, dict] = {}
    pand_props: dict[str, dict] = {}
    with PAND_PATH.open(encoding="utf-8") as f:
        for line in f:
            feat = json.loads(line)
            pid = feat["properties"]["identificatie"]
            pand_geom[pid] = feat["geometry"]
            pand_props[pid] = feat["properties"]
    log.info(f"  Loaded {len(pand_geom)} pand polygons")

    pand_addresses: dict[str, list[dict]] = {}
    n_vbo = 0
    n_orphan = 0
    with VBO_PATH.open(encoding="utf-8") as f:
        for line in f:
            v = json.loads(line)["properties"]
            pid = v.get("pandidentificatie")
            n_vbo += 1
            if not pid or pid not in pand_geom:
                n_orphan += 1
                continue
            pand_addresses.setdefault(pid, []).append({
                "vbo_id": v.get("identificatie"),
                "openbare_ruimte": v.get("openbare_ruimte"),
                "huisnummer": v.get("huisnummer"),
                "huisletter": v.get("huisletter"),
                "toevoeging": v.get("toevoeging"),
                "postcode": v.get("postcode"),
                "gebruiksdoel": v.get("gebruiksdoel"),
            })
    log.info(f"  Linked {n_vbo - n_orphan} VBOs to {len(pand_addresses)} pand "
             f"({n_orphan} orphan VBOs — pand outside bbox)")

    n_features = 0
    with JOINED_PATH.open("w", encoding="utf-8") as fout:
        fout.write('{"type":"FeatureCollection","features":[')
        first = True
        for pid, geom in pand_geom.items():
            addresses = pand_addresses.get(pid, [])
            feat = {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "pand_id": pid,
                    "bouwjaar": pand_props[pid].get("bouwjaar"),
                    "pand_status": pand_props[pid].get("status"),
                    "address_count": len(addresses),
                    "addresses": addresses,
                },
            }
            if not first:
                fout.write(",")
            fout.write(json.dumps(feat, ensure_ascii=False))
            first = False
            n_features += 1
        fout.write("]}")
    log.info(f"  Wrote {JOINED_PATH.relative_to(ROOT)} ({n_features} features)")
    return n_features


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    state = load_state()

    log.info("Fetching VBOs (bag:verblijfsobject)...")
    n_vbo = crawl("bag:verblijfsobject", VBO_PATH, "vbo_start", state)
    log.info(f"VBO total: {n_vbo}")

    log.info("Fetching panden (bag:pand)...")
    n_pand = crawl("bag:pand", PAND_PATH, "pand_start", state)
    log.info(f"Pand total: {n_pand}")

    n_joined = join()
    log.info("=" * 60)
    log.info(f"Done. {n_joined} buildings ready in {JOINED_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main() or 0)
