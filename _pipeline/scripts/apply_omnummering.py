"""Put the Grunnlink conversions (omnummer_wijkadressen.py) into the site data.

For a book with wijk addresses (ADRESBOEK_BOOK=1854): rewrites output/json/*.json
in place (idempotent). Per entry:
     address_number   "C 95a"              wijk letter + number, as the book prints it
     address_full     "Poelestraat C 95a"  the 1854 address, shown in the site
     address_modern   "Poelestraat 39"     today's address, or today's street only, or null
     address_modern_status  house | ambiguous | street_only | none
     description      firm / goods traded (the DB has no column of its own for these)
Run match_kadaster_1832.py (places the entries on the map) and build_db.py afterwards.
"""

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.config import JSON_DIR, OUTPUT_DIR  # noqa: E402

CSV_PATH = OUTPUT_DIR / "omnummering" / "addresses.csv"


def main() -> None:
    by_scan = defaultdict(list)
    with CSV_PATH.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            by_scan[row["scan"]].append(row)
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
        assert i == len(rows), f"{f.stem}: {i} entries, {len(rows)} CSV rows"
        f.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")

    print(dict(stats))


if __name__ == "__main__":
    main()
