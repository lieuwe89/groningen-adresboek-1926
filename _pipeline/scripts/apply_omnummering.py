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
REVIEW_PATH = OUTPUT_DIR / "omnummering" / "straatreview.csv"


def street_rejected() -> set:
    """(book street, wijk, Grunnlink street) where the street review does not back Grunnlink's house.

    Lieuwe's verdict counts; an open row counts only with a proposal Y of certainty hoog/middel (owner decision
    2026-11-15: no house rather than the wrong house). Rows with matching streets are never in the review.
    """
    if not REVIEW_PATH.exists():
        return set()
    out = set()
    for r in csv.DictReader(REVIEW_PATH.open(encoding="utf-8", newline="")):
        ok = r["review"] == "Y" if r["review"] in ("Y", "N") else r["voorstel"] == "Y" and r["zekerheid"] in ("hoog", "middel")
        if not ok:
            out.add((r["straat_in_boek"], r["wijk"], r["straat_grunnlink"]))
    return out


def review_key(row: dict) -> tuple:
    return row["book_street"], row["wijk"], row["modern_street"]


def main() -> None:
    by_scan = defaultdict(list)
    with CSV_PATH.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            by_scan[row["scan"]].append(row)
    stats = Counter()
    rejected = street_rejected()

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
                while wijk and (raw + " ").startswith(wijk + " "):  # already applied; an entry with only a wijk letter became "S", then "S S"
                    raw = raw[len(wijk) + 1:]
                e["address_number"] = f"{wijk} {raw}".strip()
                e["address_full"] = " ".join(x for x in (e.get("address_street"), e["address_number"]) if x)
                status = row["status"]
                if row["street_check"] == "differs" and review_key(row) in rejected:
                    status = "none"  # Grunnlink's street is not backed by the review; the book's street stays in address_full
                    stats["street_review_rejected"] += 1
                e["address_modern_status"] = status
                e["address_modern"] = " ".join(x for x in (row["modern_street"], row["modern_number"]) if x) if status != "none" else None
                e["description"] = "; ".join(x for x in (e.get("firm"), e.get("specialization")) if x) or None
                stats[status] += 1
        assert i == len(rows), f"{f.stem}: {i} entries, {len(rows)} CSV rows"
        f.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")

    print(dict(stats))


if __name__ == "__main__":
    main()
