"""Convert wijk addresses (wijk letter + number, pre-1899 Groningen) to modern addresses via Grunnlink.

Reads output/json/*.json (occupation_register pages), asks
https://grunnlink.lieuwejongsma.nl/api/omnummering once per unique wijk+number
(cached on disk, so re-runs are free) and writes output/omnummering/addresses.csv,
one row per entry.

status:  house        one modern house number
         ambiguous    several modern house numbers (old house split up)
         street_only  Grunnlink knows the street, not the number
         none         not found
street_check: "ok" / "differs" — the book prints the street too, so a mismatch
with Grunnlink's street flags a wrong reading or an earlier renumbering of the wijk.

Usage:  ADRESBOEK_BOOK=1854 python scripts/omnummer_wijkadressen.py [YEAR=1854]
"""

import csv
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.config import JSON_DIR, OUTPUT_DIR  # noqa: E402

API = "https://grunnlink.lieuwejongsma.nl/api/omnummering"
OUT = OUTPUT_DIR / "omnummering"
CACHE = OUT / "cache.json"


def lookup(wijk: str, number: str, cache: dict) -> dict:
    key = f"{wijk} {number}"
    if key not in cache:
        url = API + "?" + urllib.parse.urlencode({"epoch": "1822", "wijk": wijk, "number": number})
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                cache[key] = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 400:  # 400 = Grunnlink rejects the input (misread wijk/number); anything else: stop, re-run resumes
                raise
            cache[key] = {"results": [], "notes": ["rejected_by_grunnlink"]}
        time.sleep(0.1)  # be polite to our own server
    return cache[key]


def norm(street: str) -> str:
    s = (street or "").lower()
    s = re.sub(r"^(o\.|n\.|r\.|gr\.|kl\.|oude|nieuwe|groote|grote|kleine|gedempte|buiten|voor|bij de|bij het|bij|op de|achter de|achter)\s+", "", s)
    for a, b in (("sch", "s"), ("oo", "o"), ("ee", "e"), ("aa", "a"), ("uu", "u"), ("ij", "y"), ("k", "c")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z]", "", s)


def same_street(book: str, modern: str) -> bool:
    a, b = norm(book), norm(modern)
    return bool(a and b) and (a[:5] in b or b[:5] in a or SequenceMatcher(None, a, b).ratio() > 0.75)


def main(year: int) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows, stats = [], Counter()
    try:
        for f in sorted(JSON_DIR.glob("*.json")):
            page = json.loads(f.read_text(encoding="utf-8"))
            for occ in page.get("occupations") or []:
                for e in occ.get("entries") or []:
                    wijk, number = (e.get("address_wijk") or "").strip().upper(), (e.get("address_number") or "").strip().rstrip(".")
                    row = {"uid": e.get("uid"), "scan": f.stem, "name": e.get("name"), "book_street": e.get("address_street"),
                           "wijk": wijk, "number": number, "status": "none", "modern_street": "", "modern_number": "",
                           "base_number_used": "", "street_check": "", "notes": ""}
                    rows.append(row)
                    if not (wijk and re.match(r"\d", number)):
                        row["notes"] = "no wijk address in entry"
                        stats["none"] += 1
                        continue
                    data = lookup(wijk, number, cache)
                    hits = [r for r in data.get("results", []) if r.get("street")
                            and r.get("period", {}).get("from", 0) <= year < r.get("period", {}).get("until", 9999)]
                    numbers = sorted({r["newNumber"] for r in hits if r.get("newNumber")})
                    streets = sorted({r["street"] for r in hits})
                    if hits:
                        row["status"] = "house" if len(numbers) == 1 else "ambiguous" if numbers else "street_only"
                        row["modern_street"] = " / ".join(streets)
                        row["modern_number"] = " / ".join(numbers)
                        row["base_number_used"] = "y" if data.get("baseNumberUsed") else ""
                        row["street_check"] = "ok" if any(same_street(row["book_street"], s) for s in streets) else "differs"
                    row["notes"] = ",".join(n for n in data.get("notes", []) if n not in ("city", "snapshot"))
                    if data.get("results") and not hits:
                        row["notes"] += ",known_only_in_other_period"
                    stats[row["status"]] += 1
                    stats["street_" + row["street_check"]] += bool(row["street_check"])
    finally:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    with (OUT / "addresses.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} entries, {len(cache)} unique wijk addresses looked up → {OUT / 'addresses.csv'}")
    print(dict(stats))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1854)
