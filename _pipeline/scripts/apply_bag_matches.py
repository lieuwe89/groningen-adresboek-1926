#!/usr/bin/env python3
"""
Add new BAG building links to a live adresboek.sqlite without a rebuild.

build_db.py recreates the whole DB, which would clobber prod-only state
(admin edits, manual pand pins). This script only fills entries.pand_id
where it is still NULL and the address is unchanged, and adds/updates the
matching buildings rows. build/apply never change or remove existing links.

  build:  python3 apply_bag_matches.py build <target.sqlite> <payload.json>
          (reads output/bag/match.json + buildings.geojson; run locally)
  apply:  python3 apply_bag_matches.py apply <target.sqlite> <payload.json>
          (stdlib only; safe to run on the VPS)
  unlink: python3 apply_bag_matches.py unlink <target.sqlite> <links.json>
          ({stable_id: pand_id} to remove, e.g. after a rename turned out
          wrong; buildings left without entries are deleted)

Build the payload against a copy of the DB you will apply it to.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATCH = ROOT / "output" / "bag" / "match.json"
BUILDINGS = ROOT / "output" / "bag" / "buildings.geojson"


def build(db_path: str, payload_path: str) -> None:
    conn = sqlite3.connect(db_path)
    unlinked = dict(conn.execute(
        "SELECT stable_id, address_full FROM entries WHERE pand_id IS NULL"
    ))
    entries = {}
    for pand_id, b in json.loads(MATCH.read_text(encoding="utf-8")).items():
        if pand_id == "_summary":
            continue
        for a in b["addresses"].values():
            for sid in a["entries"]:
                if sid in unlinked:
                    entries[sid] = {"pand_id": pand_id, "address_full": unlinked[sid]}

    wanted = {e["pand_id"] for e in entries.values()}
    buildings = {}
    for feat in json.loads(BUILDINGS.read_text(encoding="utf-8"))["features"]:
        p = feat["properties"]
        if p["pand_id"] not in wanted:
            continue
        geom = feat["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        pts = [c for poly in polys for ring in poly for c in ring]
        xs, ys = [c[0] for c in pts], [c[1] for c in pts]
        buildings[p["pand_id"]] = {
            "geometry": json.dumps(geom, ensure_ascii=False),
            "bbox": [min(xs), min(ys), max(xs), max(ys)],
            "address_count": p.get("address_count", 0),
            "bouwjaar": p.get("bouwjaar"),
        }
    Path(payload_path).write_text(json.dumps(
        {"entries": entries, "buildings": buildings}, ensure_ascii=False))
    print(f"payload: {len(entries)} entries -> {len(buildings)} panden")


def apply(db_path: str, payload_path: str) -> None:
    payload = json.loads(Path(payload_path).read_text(encoding="utf-8"))
    conn = sqlite3.connect(db_path)
    with conn:  # one transaction
        linked = 0
        touched = set()
        for sid, e in payload["entries"].items():
            cur = conn.execute(
                "UPDATE entries SET pand_id = ? "
                "WHERE stable_id = ? AND pand_id IS NULL AND address_full = ?",
                (e["pand_id"], sid, e["address_full"]),
            )
            if cur.rowcount:
                linked += 1
                touched.add(e["pand_id"])
        new_buildings = 0
        for pid in touched:
            b = payload["buildings"][pid]
            w, s, east, n = b["bbox"]
            cur = conn.execute(
                """INSERT OR IGNORE INTO buildings
                   (pand_id, geometry, bbox_west, bbox_south, bbox_east, bbox_north,
                    centroid_lat, centroid_lng, address_count, entry_count, bouwjaar)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
                (pid, b["geometry"], w, s, east, n, (s + n) / 2, (w + east) / 2,
                 b["address_count"], b["bouwjaar"]),
            )
            new_buildings += cur.rowcount
            conn.execute(
                "UPDATE buildings SET entry_count = "
                "(SELECT COUNT(*) FROM entries WHERE pand_id = ?) WHERE pand_id = ?",
                (pid, pid),
            )
    skipped = len(payload["entries"]) - linked
    print(f"linked {linked} entries ({skipped} skipped: already linked or address changed), "
          f"{new_buildings} new buildings, {len(touched)} buildings recounted")


def unlink(db_path: str, links_path: str) -> None:
    links = json.loads(Path(links_path).read_text(encoding="utf-8"))
    conn = sqlite3.connect(db_path)
    with conn:
        removed = 0
        touched = set()
        for sid, pid in links.items():
            cur = conn.execute(
                "UPDATE entries SET pand_id = NULL WHERE stable_id = ? AND pand_id = ?",
                (sid, pid),
            )
            if cur.rowcount:
                removed += 1
                touched.add(pid)
        for pid in touched:
            conn.execute(
                "UPDATE buildings SET entry_count = "
                "(SELECT COUNT(*) FROM entries WHERE pand_id = ?) WHERE pand_id = ?",
                (pid, pid),
            )
        deleted = conn.execute(
            "DELETE FROM buildings WHERE entry_count = 0 AND pand_id IN (%s)"
            % ",".join("?" * len(touched)),
            list(touched),
        ).rowcount if touched else 0
    print(f"unlinked {removed} entries, {len(touched)} buildings recounted, {deleted} deleted")


if __name__ == "__main__":
    modes = {"build": build, "apply": apply, "unlink": unlink}
    if len(sys.argv) != 4 or sys.argv[1] not in modes:
        sys.exit(__doc__)
    modes[sys.argv[1]](sys.argv[2], sys.argv[3])
