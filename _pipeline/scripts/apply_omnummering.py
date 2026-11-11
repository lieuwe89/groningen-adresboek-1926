"""Put the Grunnlink conversions (omnummer_wijkadressen.py) into the site data.

For a book with wijk addresses (ADRESBOEK_BOOK=1854):

1. Rewrites output/json/*.json in place (idempotent). Per entry:
     address_number   "C 95a"              wijk letter + number, as the book prints it
     address_full     "Poelestraat C 95a"  the 1854 address, shown in the site
     address_modern   "Poelestraat 39"     today's address, or today's street only, or null
     address_modern_status  house | ambiguous | street_only | none
     description      firm / goods traded (the DB has no column of its own for these)
2. Writes output/bag/match.json (pand_id → entries) by looking the modern address up
   in the BAG address index, in the format build_db.py reads. The map only draws
   buildings, so only "house"/"ambiguous" entries reach it; for "ambiguous" the
   first of the modern numbers is used.

Run build_db.py afterwards.
"""

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_addresses import expanded_streets  # noqa: E402

from pipeline.config import JSON_DIR, OUTPUT_DIR  # noqa: E402

CSV_PATH = OUTPUT_DIR / "omnummering" / "addresses.csv"
BUILDINGS = OUTPUT_DIR / "bag" / "buildings.geojson"
MATCH = OUTPUT_DIR / "bag" / "match.json"


def bag_index() -> dict:
    index = {}
    for feat in json.loads(BUILDINGS.read_text(encoding="utf-8"))["features"]:
        for a in feat["properties"]["addresses"]:
            if a.get("huisnummer") is None:
                continue
            for street in expanded_streets(a.get("openbare_ruimte")):
                index.setdefault((street, int(a["huisnummer"]), (a.get("huisletter") or "").lower()), feat["properties"]["pand_id"])
    return index


def find_pand(index: dict, street: str, number: str) -> str | None:
    m = re.match(r"(\d+)\s*([a-z]?)", number.split("/")[0].strip().lower())
    if not m:
        return None
    num, letter = int(m.group(1)), m.group(2)
    for cand in expanded_streets(street.split(" / ")[0]):
        # exact, without letter, any letter, then a neighbour on the same side (merged/demolished houses)
        keys = [(cand, num, letter), (cand, num, "")] + [(cand, num, c) for c in "abcdefgh"] + [(cand, num + d, "") for d in (2, -2, 4, -4)]
        for key in keys:
            if key in index:
                return index[key]
    return None


def main() -> None:
    by_scan = defaultdict(list)
    with CSV_PATH.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            by_scan[row["scan"]].append(row)
    index = bag_index()
    matches: dict = {}
    stats = Counter()

    for f in sorted(JSON_DIR.glob("*.json")):
        page = json.loads(f.read_text(encoding="utf-8"))
        rows = by_scan.get(f.stem)
        if not rows or page.get("section") != "occupation_register":
            continue
        i = 0
        for occ in page.get("occupations") or []:
            if occ.get("occupation_name"):
                occ["occupation_name"] = occ["occupation_name"].rstrip(". ")
            for e in occ.get("entries") or []:
                row, sid = rows[i], f"{f.stem}:{i}"
                i += 1
                assert row["name"] == (e.get("name") or ""), f"{sid}: CSV and JSON out of step — re-run omnummer_wijkadressen.py"
                wijk = (e.get("address_wijk") or "").strip()
                raw = (e.get("address_number") or "").strip().rstrip(".")
                if wijk and raw.startswith(wijk + " "):  # already applied
                    raw = raw[len(wijk) + 1:]
                e["address_number"] = f"{wijk} {raw}".strip()
                e["address_full"] = " ".join(x for x in (e.get("address_street"), e["address_number"]) if x)
                status = row["status"]
                e["address_modern_status"] = status
                e["address_modern"] = " ".join(x for x in (row["modern_street"], row["modern_number"]) if x) or None
                e["description"] = "; ".join(x for x in (e.get("firm"), e.get("specialization")) if x) or None
                stats[status] += 1
                if status in ("house", "ambiguous"):
                    pand = find_pand(index, row["modern_street"], row["modern_number"])
                    if pand:
                        a = matches.setdefault(pand, {"addresses": {}})["addresses"].setdefault(
                            e["address_modern"].lower(), {"lat": None, "lng": None, "entries": [], "raw": e["address_modern"]})
                        a["entries"].append(sid)
                        stats["on_map"] += 1
                    else:
                        stats["no_bag_building"] += 1
        assert i == len(rows), f"{f.stem}: {i} entries, {len(rows)} CSV rows"
        f.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")

    matches["_summary"] = dict(stats)
    MATCH.write_text(json.dumps(matches, ensure_ascii=False), encoding="utf-8")
    print(dict(stats), "→", MATCH)


if __name__ == "__main__":
    main()
