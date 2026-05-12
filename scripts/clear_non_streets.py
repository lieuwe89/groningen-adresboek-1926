#!/usr/bin/env python3
"""Clear bogus values out of `address_street_expanded` and related fields.

Three categories get scrubbed:

1. **Place names outside Groningen** — single-token destinations like "Lemmer",
   "Amsterdam". The 1926 adresboek captured them for ferry-line entries; they
   are not the person's residence and don't belong in the address field.

2. **Multi-address descriptions** — entries that describe a route or list
   multiple addresses ("Loopt van X tot Y", "X, hoek Y", "X en Y"). Moved
   verbatim to `notes` so the data survives, then cleared from address.

3. **Obvious entity / noise** — all-caps multi-word strings ("GRONINGER
   LEMMER STOOMBOOT MAATSCHAPPIJ") and stub fragments.

Only acts on entries whose street is NOT in the BAG canonical set, so genuine
Groningen streets are never touched.

Default is dry-run; pass `--apply` to actually write.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "adresboek.sqlite"
BAG_PATH = ROOT / "_pipeline" / "output" / "bag" / "buildings.geojson"


# Far-away / ferry destinations the LLM put in address_street; these are not
# Groningen residences. Excludes neighbouring municipalities (Haren, Bedum,
# Heereveen, Hoogezand) where the entry may be a legitimate, if incomplete,
# nearby address.
PLACE_NAMES_OUTSIDE_GRONINGEN = {
    "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Leeuwarden", "Lemmer",
    "Drachten", "Sneek", "Coevorden", "Winschoten", "Delfzijl",
    "Stadskanaal", "Veendam", "Appingedam",
    "Oldenburg", "Bremen", "Hamburg", "Antwerpen", "Brussel",
    "LEMME", "LEMMER",
}

MULTI_ADDR_MARKERS = (
    " en ", " tot ", " naar ", ", hoek ", ", Hoek ", " ingang ",
    " of ", ", ", "Loopt ", "loopt ", "Dagelijksche dienst",
    "Beurtdienst", "/ ",
)

STREET_SUFFIXES = (
    "straat", "straatje", "weg", "laan", "plein", "singel", "kade",
    "pad", "hof", "markt", "gracht", "diep", "park", "haven", "baan",
    "rijge", "rij", "dijk", "boog", "wal", "brug", "veld", "berg",
    "kerkhof", "steeg", "gang", "drift", "hoek", "klooster", "tuin",
    "akker", "kerk", "molen", "barg", "boord", "horn", "burg", "kuipen",
    "huis", "stein", "weide", "ven", "es", "borg", "ster", "land",
    "stede", "plaats", "schans", "sluis",
)


def load_bag_streets() -> set[str]:
    if not BAG_PATH.exists():
        return set()
    data = json.loads(BAG_PATH.read_text())
    return {
        a["openbare_ruimte"]
        for f in data["features"]
        for a in f["properties"].get("addresses", [])
        if a.get("openbare_ruimte")
    }


def has_street_suffix(value: str) -> bool:
    low = value.lower().rstrip(". ")
    return any(low.endswith(suf) for suf in STREET_SUFFIXES)


def is_place_name(value: str) -> bool:
    if value in PLACE_NAMES_OUTSIDE_GRONINGEN:
        return True
    first_token = value.split()[0] if value else ""
    return first_token in PLACE_NAMES_OUTSIDE_GRONINGEN and not has_street_suffix(value)


def is_multi_address(value: str) -> bool:
    if "," in value and not value.startswith("'t "):
        return True
    if any(m in value for m in MULTI_ADDR_MARKERS):
        return True
    return False


def is_caps_noise(value: str) -> bool:
    if value.isupper() and not has_street_suffix(value):
        return True
    return False


# Words that indicate an entity name (company, institution) rather than a street.
ENTITY_KEYWORDS = (
    "maatschappij", "stoomboot", "stoombootdienst", " mij.", " mij ",
    "vereeniging", "vereniging", "kantoor van",
    "instituut", "fabriek", "drukkerij",
)


def is_entity_name(value: str) -> bool:
    low = " " + value.lower() + " "
    return any(kw in low for kw in ENTITY_KEYWORDS)


def classify(value: str, canon: set[str]) -> str | None:
    if not value:
        return None
    if value in canon:
        return None  # genuine street
    if is_place_name(value):
        return "place_outside"
    if is_multi_address(value):
        return "multi_address"
    if is_caps_noise(value):
        return "caps_noise"
    if is_entity_name(value):
        return "entity_name"
    return None  # leave alone


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="Actually write changes (default: dry-run)")
    ap.add_argument("--db", default=str(DB_PATH))
    args = ap.parse_args()

    canon = load_bag_streets()
    print(f"BAG canonical streets: {len(canon)}")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    counts: dict[str, int] = {"place_outside": 0, "multi_address": 0, "caps_noise": 0, "entity_name": 0}
    examples: dict[str, list[str]] = {k: [] for k in counts}

    cur.execute(
        "SELECT id, address_street_expanded, address_street, address_number, "
        "address_full, notes FROM entries "
        "WHERE address_street_expanded IS NOT NULL AND address_street_expanded != ''"
    )
    rows = cur.fetchall()

    updates: list[tuple[int, str | None, str | None, str | None, str]] = []
    for row in rows:
        street = row["address_street_expanded"]
        verdict = classify(street, canon)
        if not verdict:
            continue
        counts[verdict] += 1
        if len(examples[verdict]) < 5:
            examples[verdict].append(street)

        notes = row["notes"] or ""
        tag = {
            "place_outside": "place outside Groningen",
            "multi_address": "multi-address",
            "caps_noise": "entity / OCR noise",
            "entity_name": "entity / company name",
        }[verdict]
        raw = row["address_street"] or ""
        annotation = (
            f"[was address_street: {street!r} ({tag})"
            + (f" / raw: {raw!r}" if raw and raw != street else "")
            + "]"
        )
        new_notes = (notes + "\n" + annotation).strip() if notes else annotation

        # Clear BOTH raw and expanded — otherwise the next normalize_streets
        # pass repopulates address_street_expanded from the raw string after
        # only the trailing-period strip, undoing this cleanup. The original
        # value is preserved verbatim in notes.
        new_full = (row["address_number"] or "") or None
        updates.append((row["id"], None, new_full, new_notes, verdict))

    print(f"\nDry-run summary (would touch {len(updates)} entries):")
    for k, n in counts.items():
        print(f"  {k:15s}: {n} entries")
        for ex in examples[k]:
            print(f"      e.g. {ex!r}")

    if not args.apply:
        print("\n(use --apply to write)")
        conn.close()
        return 0

    cur.execute("BEGIN")
    for entry_id, new_expanded, new_full, new_notes, _ in updates:
        cur.execute(
            "UPDATE entries SET address_street = ?, address_street_expanded = ?, "
            "address_full = ?, notes = ? WHERE id = ?",
            (new_expanded, new_expanded, new_full, new_notes, entry_id),
        )
    cur.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
    conn.commit()
    conn.close()
    print(f"\nApplied. Updated {len(updates)} entries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
