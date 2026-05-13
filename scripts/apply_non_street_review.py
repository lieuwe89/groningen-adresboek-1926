#!/usr/bin/env python3
"""Apply a user-reviewed non-street TSV to the database.

TSV format: count<TAB>value<TAB>decision  (header row required).
  decision = "y"      -> not a street, clear the field
  decision = "n"/"no" -> is a street, leave alone (will be fed to fuzzy
                        suggestion pass for follow-up)
  decision = ""       -> not reviewed yet, leave alone

For y-decisions: null `address_street` and `address_street_expanded`,
move the original verbatim to `notes`, then rebuild FTS.

Default is dry-run; pass --apply to actually write.
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "adresboek.sqlite"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("tsv", help="Path to reviewed TSV")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--db", default=str(DB_PATH))
    args = ap.parse_args()

    clear_values: set[str] = set()
    keep_values: set[str] = set()

    with open(args.tsv, newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader, None)  # skip header
        for row in reader:
            if len(row) < 3:
                continue
            value = row[1].strip()
            decision = row[2].strip().lower()
            if not value:
                continue
            if decision == "y":
                clear_values.add(value)
            elif decision in ("n", "no"):
                keep_values.add(value)

    print(f"to clear:  {len(clear_values)} distinct values")
    print(f"to keep:   {len(keep_values)} distinct values (real streets — feed to fuzzy)")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    matches: list[tuple[int, str, str | None]] = []
    placeholders = ",".join("?" * len(clear_values))
    if clear_values:
        cur.execute(
            f"SELECT id, address_street_expanded, address_street, notes "
            f"FROM entries WHERE address_street_expanded IN ({placeholders})",
            list(clear_values),
        )
        rows = cur.fetchall()
        for row in rows:
            notes = row["notes"] or ""
            raw = row["address_street"] or ""
            ann = (
                f"[was address_street: {row['address_street_expanded']!r} "
                f"(reviewed non-street)"
                + (f" / raw: {raw!r}" if raw and raw != row["address_street_expanded"] else "")
                + "]"
            )
            new_notes = (notes + "\n" + ann).strip() if notes else ann
            matches.append((row["id"], new_notes, None))

    print(f"\nEntries to update: {len(matches)}")

    if not args.apply:
        print("\n(dry-run; pass --apply to write)")
        conn.close()
        return 0

    cur.execute("BEGIN")
    for entry_id, new_notes, _ in matches:
        cur.execute(
            "UPDATE entries SET address_street = NULL, "
            "address_street_expanded = NULL, address_full = address_number, "
            "notes = ? WHERE id = ?",
            (new_notes, entry_id),
        )
    cur.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
    conn.commit()
    conn.close()
    print(f"\nApplied. Cleared {len(matches)} entries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
