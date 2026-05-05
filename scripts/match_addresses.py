#!/usr/bin/env python3
"""
Match book entries to BAG buildings (pand) via VBO address.

Reads:
  output/bag/buildings.geojson   (from scripts/ingest_bag.py)
  web/data/adresboek.sqlite      (current build)

Writes:
  output/bag/match.json
    {
      "<pand_id>": {
        "addresses": {
          "<address_full lower>": {
            "lat": ..., "lng": ...,
            "entries": ["<stable_id>", ...]
          }
        }
      },
      "_summary": {...}
    }

Run:
  .venv/bin/python scripts/match_addresses.py
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILDINGS = ROOT / "output" / "bag" / "buildings.geojson"
DB = ROOT / "web" / "data" / "adresboek.sqlite"
OUT = ROOT / "output" / "bag" / "match.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("match")


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


# Common street-name normalisations between the 1926 book and modern BAG.
# Many of these encode the 1947 Marchant spelling reform (oo→o, ee→e in
# closed syllables, sch→s in some cases) and Dutch abbreviation conventions.
STREET_FIXUPS = [
    (r"\bst\.?\b", "sint"),
    (r"\bgr\.?\b", "groote"),
    (r"\bn\.?\b", "noorder"),
    (r"\bo\.?\b", "ooster"),
    (r"\bz\.?\b", "zuider"),
    (r"\bw\.?\b", "wester"),
    (r"\bgebr\.?\b", "gebroeders"),
    (r"\bgerbr\.?\b", "gerbrand"),
    (r"\bjhr\.?\b", "jonkheer"),
    (r"\bds\.?\b", "dominee"),
    (r"\bmr\.?\b", "meester"),
    (r"\bdr\.?\b", "doctor"),
    (r"\bprof\.?\b", "professor"),
    (r"\bhelper\s+kerkstraat\b", "kerkstraat"),  # BAG "Helper Kerkstraat" = 1926 book "Kerkstraat"
    (r"\bkon\.?\b", "koningin"),
    (r"\bkoning\.?\b", "koningin"),
    (r"\bsav\.?\b", "savornin"),
    (r"\bw\.?\s*a\.?\s*scholtenstraat", "w a scholtenstraat"),
    (r"\bhardewijkerstraat\b", "hardewikerstraat"),
    (r"\broodeweg\b", "rodeweg"),
    (r"\bfriesche\s*straatweg\b", "friesestraatweg"),
    (r"\bvisscherstraat\b", "visserstraat"),
]

# 1947 spelling reform — pre-reform → post-reform stem.
# Only word fragments where the reform actually applies in Groningen street
# names (encoded as substring replacements; both directions tried at lookup).
SPELLING_REFORM = [
    ("groote", "grote"),
    ("heere", "here"),
    ("hooge", "hoge"),
    ("nieuwe ", "nieuwe "),
    ("breede", "brede"),
    ("vischmarkt", "vismarkt"),
    ("visch", "vis"),
    ("kerckhof", "kerkhof"),
    ("schans", "skans"),
]


def normalise_street(name: str | None) -> str:
    if not name:
        return ""
    s = strip_accents(name).lower().strip()
    s = re.sub(r"[^a-z0-9 \-']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Try fixups but always also keep the raw form — match against either.
    return s


def expanded_streets(name: str | None) -> set[str]:
    """Return a small set of normalised aliases for one street name."""
    if not name:
        return set()
    base = normalise_street(name)
    out = {base}
    # Apply all fixups, both individually and pairwise, so e.g. "Sav. Lohmanlaan"
    # → "savornin lohmanlaan" → also "de savornin lohmanlaan" via prefix.
    fixed = base
    for pat, repl in STREET_FIXUPS:
        fixed = re.sub(pat, repl, fixed)
    out.add(fixed)
    # Spelling reform applies to whichever variant we have so far.
    extra = set()
    for s in out:
        for old, new in SPELLING_REFORM:
            if old in s:
                extra.add(s.replace(old, new))
            if new in s:
                extra.add(s.replace(new, old))
    out |= extra
    # Dash/space variants
    more = set()
    for s in out:
        more.add(s.replace("-", " "))
        more.add(s.replace(" ", "-"))
    out |= more
    # Common prefix variants (street name as the book might omit a leading
    # particle that BAG includes, e.g. "Sav. Lohmanlaan" vs "De Savornin
    # Lohmanlaan")
    prefixed = set()
    for s in out:
        for p in ("de ", "van ", "der "):
            prefixed.add(p + s)
            if s.startswith(p):
                prefixed.add(s[len(p):])
    out |= prefixed
    return {s.strip() for s in out if s.strip()}


# Match a trailing house number like "41", "5a", "19-21" (we capture the LOW
# end), "12 bis" (rare). Anchored at end of address.
NUM_RE = re.compile(
    r"(\d+)\s*([a-zA-Z](?![a-zA-Z]))?(?:\s*[-/]\s*\d+[a-zA-Z]?)?\s*$"
)


def clean_address(address_full: str) -> str:
    s = address_full.strip()
    # Strip trailing junk: ".", ",", "(...)", "%"
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s)
    s = re.sub(r"[%.,;]+$", "", s).strip()
    # Repair line-wrapped streets like "Reitemakers- rijge" → "Reitemakersrijge"
    s = re.sub(r"-\s+", "-", s)
    s = re.sub(r"\s+", " ", s)
    # Strip business-name prefix: anything before the LAST comma, e.g.
    # "Petroleum Mij., Sumatralaan 45" → "Sumatralaan 45". Only apply if the
    # tail still has a number — else we'd lose the address.
    if "," in s:
        tail = s.rsplit(",", 1)[-1].strip()
        if re.search(r"\d", tail):
            s = tail
    return s


def parse_book_address(address_full: str | None) -> tuple[str, int, str] | None:
    if not address_full:
        return None
    s = clean_address(address_full)
    m = NUM_RE.search(s)
    if not m:
        return None
    huisnummer = int(m.group(1))
    huisletter = (m.group(2) or "").lower()
    street = s[: m.start()].strip(" ,.-")
    if not street:
        return None
    return normalise_street(street), huisnummer, huisletter


def main() -> None:
    if not BUILDINGS.exists():
        log.error(f"Missing {BUILDINGS}. Run ingest_bag.py first.")
        sys.exit(1)
    if not DB.exists():
        log.error(f"Missing {DB}. Run scripts/build_db.py first.")
        sys.exit(1)

    log.info(f"Loading {BUILDINGS.relative_to(ROOT)}...")
    with BUILDINGS.open(encoding="utf-8") as f:
        bag = json.load(f)
    log.info(f"  {len(bag['features'])} pand")

    # Build lookup: (street_normalised, huisnummer, huisletter) -> pand_id
    # Multiple street aliases may be expanded so the same VBO appears under
    # several keys. Use first-wins semantics if collisions occur.
    # Only index VBOs within the old gemeente Groningen postcode range (9700-9749).
    # Haren (9750-9759) and Ten Boer (9788-9789) merged in 2019 but their streets
    # were not in the 1926 address book; their BAG data falls within the bbox and
    # would produce wrong matches without this filter.
    def _in_old_groningen(postcode: str | None) -> bool:
        if not postcode or len(postcode) < 4:
            return True  # no postcode info — don't exclude
        try:
            pc4 = int(postcode[:4])
        except ValueError:
            return True
        return 9700 <= pc4 <= 9744  # 9745-9748 = Hoogkerk (merged 1969, not in 1926 book)

    vbo_index: dict[tuple[str, int, str], str] = {}
    n_vbos = 0
    n_vbos_skipped = 0
    for feat in bag["features"]:
        pand_id = feat["properties"]["pand_id"]
        for a in feat["properties"]["addresses"]:
            n_vbos += 1
            if not _in_old_groningen(a.get("postcode")):
                n_vbos_skipped += 1
                continue
            num = a.get("huisnummer")
            if num is None:
                continue
            letter = (a.get("huisletter") or "").lower()
            for street in expanded_streets(a.get("openbare_ruimte")):
                key = (street, int(num), letter)
                vbo_index.setdefault(key, pand_id)
    log.info(f"  Indexed {len(vbo_index)} VBO keys from {n_vbos} VBOs "
             f"({n_vbos_skipped} skipped — outside 9700-9744 range)")

    log.info("Loading book entries...")
    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT stable_id, address_full, lat, lng FROM entries "
        "WHERE lat IS NOT NULL AND address_full IS NOT NULL"
    ).fetchall()
    log.info(f"  {len(rows)} geocoded entries with addresses")

    matches: dict[str, dict] = {}
    n_matched = 0
    n_parse_fail = 0
    n_no_match = 0
    sample_no_match = []

    for stable_id, address_full, lat, lng in rows:
        parsed = parse_book_address(address_full)
        if not parsed:
            n_parse_fail += 1
            continue
        street, num, letter = parsed
        # Try every alias the book street could expand to, in turn.
        candidates = expanded_streets(street)
        pand_id: str | None = None
        for cand in candidates:
            pand_id = vbo_index.get((cand, num, letter))
            if pand_id:
                break
            if letter:
                pand_id = vbo_index.get((cand, num, ""))
                if pand_id:
                    break
            for L in "abcdefgh":
                pand_id = vbo_index.get((cand, num, L))
                if pand_id:
                    break
            
            # Fallback for missing house numbers (merged/demolished buildings)
            # Try same side of the street first (+/- 2), then adjacent (+/- 1)
            if not pand_id:
                for delta in [2, -2, 4, -4, 1, -1]:
                    pand_id = vbo_index.get((cand, num + delta, ""))
                    if pand_id:
                        break

            if pand_id:
                break
        if not pand_id:
            n_no_match += 1
            if len(sample_no_match) < 10:
                sample_no_match.append(address_full)
            continue
        n_matched += 1
        b = matches.setdefault(pand_id, {"addresses": {}})
        a = b["addresses"].setdefault(
            address_full.lower(),
            {"lat": lat, "lng": lng, "entries": [], "raw": address_full},
        )
        a["entries"].append(stable_id)

    summary = {
        "entries_total": len(rows),
        "entries_matched": n_matched,
        "entries_parse_fail": n_parse_fail,
        "entries_no_match": n_no_match,
        "buildings_with_records": len(matches),
        "match_rate_pct": round(100 * n_matched / max(len(rows), 1), 1),
        "sample_no_match": sample_no_match,
    }
    matches["_summary"] = summary

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(matches, ensure_ascii=False, indent=2))

    log.info("=" * 60)
    log.info(f"  total entries:        {summary['entries_total']}")
    log.info(f"  matched:              {summary['entries_matched']} ({summary['match_rate_pct']}%)")
    log.info(f"  parse failures:       {summary['entries_parse_fail']}")
    log.info(f"  no BAG match:         {summary['entries_no_match']}")
    log.info(f"  buildings w/ records: {summary['buildings_with_records']}")
    log.info(f"  output:               {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main() or 0)
