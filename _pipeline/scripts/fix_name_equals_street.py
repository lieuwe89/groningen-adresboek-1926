"""
Fix entries in the street register where address_street == name (OCR misinterpretation).

In the stratenregister, the OCR sometimes assigns the person's last name as the
street name. This script detects these cases and either:
  - Sets the correct street name (inferred from same-page neighbors), or
  - Clears address_street when the correct street cannot be determined.
"""

import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "data" / "adresboek.sqlite"

# Street names that are OCR artifacts, not real streets
BLOCKED_STREETS = {
    "unnamed street",
    "loopt",
}

def is_blocked(street: str) -> bool:
    s = street.lower()
    if any(b in s for b in ["groninger lemmer", "dagelijksche", "stoomboot"]):
        return True
    for b in BLOCKED_STREETS:
        if s.startswith(b):
            return True
    return False


def is_name_equals_street(name: str | None, street: str | None) -> bool:
    if not name or not street:
        return False
    return name.strip().lower() == street.strip().lower()


def build_address_full(street: str | None, number: str | None) -> str:
    parts = [p.strip() for p in [street, number] if p and p.strip()]
    return " ".join(parts)


def compute_searchable_text(entry: dict, address_street: str | None) -> str:
    fields = [
        entry.get("name"), entry.get("initials"), entry.get("name_prefix"),
        entry.get("name_prefix_expanded"), entry.get("occupation"),
        entry.get("occupation_expanded"), address_street, address_street,
        entry.get("address_number"),
    ]
    return " ".join(f.strip() for f in fields if f and f.strip())


def fix_name_equals_street(dry_run: bool = False) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Build a set of "established" streets: appear > 10 times and not blocked.
    cur.execute("""
        SELECT address_street, COUNT(*) as cnt
        FROM entries
        WHERE address_street IS NOT NULL AND address_street != ''
        GROUP BY address_street
        HAVING cnt > 10
    """)
    established = {
        row["address_street"]
        for row in cur.fetchall()
        if not is_blocked(row["address_street"])
    }

    # Load all street_register entries ordered by page then entry_index.
    cur.execute("""
        SELECT e.id, e.entry_index, e.name, e.initials, e.name_prefix,
               e.name_prefix_expanded, e.occupation, e.occupation_expanded,
               e.address_street, e.address_street_expanded,
               e.address_number, e.address_full, p.stem, p.page_number
        FROM entries e
        JOIN pages p ON e.page_id = p.id
        WHERE p.section = 'street_register'
        ORDER BY p.page_number, p.stem, e.entry_index
    """)
    all_entries = [dict(row) for row in cur.fetchall()]

    # Group entries by page (stem) to enable same-page neighbor lookup.
    from collections import defaultdict
    by_page: dict[str, list[dict]] = defaultdict(list)
    for e in all_entries:
        by_page[e["stem"]].append(e)

    fixed = 0
    cleared = 0
    skipped = 0

    for stem, entries in by_page.items():
        n = len(entries)
        for i, entry in enumerate(entries):
            if not is_name_equals_street(entry["name"], entry["address_street"]):
                continue

            # Find nearest same-page anchors: entries where name != street
            # AND the street is established (appears frequently and isn't blocked).
            WINDOW = 60
            back_street = None
            fwd_street = None

            for delta in range(1, WINDOW + 1):
                if back_street is None and i - delta >= 0:
                    e2 = entries[i - delta]
                    s2 = e2["address_street"]
                    if (
                        not is_name_equals_street(e2["name"], s2)
                        and s2
                        and s2 in established
                        and not is_blocked(s2)
                    ):
                        back_street = s2
                if fwd_street is None and i + delta < n:
                    e2 = entries[i + delta]
                    s2 = e2["address_street"]
                    if (
                        not is_name_equals_street(e2["name"], s2)
                        and s2
                        and s2 in established
                        and not is_blocked(s2)
                    ):
                        fwd_street = s2
                if back_street and fwd_street:
                    break

            # Determine correct street.
            correct_street: str | None
            if back_street and fwd_street and back_street.lower() == fwd_street.lower():
                correct_street = back_street
            elif back_street and not fwd_street:
                correct_street = back_street
            elif fwd_street and not back_street:
                # Only forward anchor — risky (could be the next street).
                # Accept only if the forward anchor is within 5 entries.
                fwd_delta = next(
                    (
                        d for d in range(1, WINDOW + 1)
                        if i + d < n
                        and not is_name_equals_street(entries[i + d]["name"], entries[i + d]["address_street"])
                        and entries[i + d]["address_street"] in established
                        and not is_blocked(entries[i + d]["address_street"] or "")
                    ),
                    WINDOW + 1,
                )
                correct_street = fwd_street if fwd_delta <= 5 else None
            else:
                correct_street = None  # Ambiguous or no anchor found.

            # Never infer a street that is identical to the person's own name —
            # these are surnames (Groeneveld, Zanting, Wagter, Tongeren, …)
            # that appeared in "established" due to other OCR errors on the same
            # street section, not real Groningen street names.
            if correct_street and correct_street.strip().lower() == (entry["name"] or "").strip().lower():
                correct_street = None

            entry_id = entry["id"]
            num = entry["address_number"]

            if correct_street:
                addr_full = build_address_full(correct_street, num)
                addr_norm = re.sub(r"\s+", " ", addr_full.lower()).strip()
                search_text = compute_searchable_text(entry, correct_street)
                if not dry_run:
                    cur.execute(
                        """
                        UPDATE entries
                        SET address_street = ?,
                            address_street_expanded = ?,
                            address_full = ?,
                            address_full_normalized = ?,
                            searchable_text = ?
                        WHERE id = ?
                        """,
                        (correct_street, correct_street, addr_full, addr_norm,
                         search_text, entry_id),
                    )
                print(f"  FIX  {entry['stem']}:{entry['entry_index']}  {entry['name']!r}  →  {correct_street!r}  #{num}")
                fixed += 1
            else:
                search_text = compute_searchable_text(entry, None)
                if not dry_run:
                    cur.execute(
                        """
                        UPDATE entries
                        SET address_street = NULL,
                            address_street_expanded = NULL,
                            address_full = NULL,
                            address_full_normalized = NULL,
                            searchable_text = ?
                        WHERE id = ?
                        """,
                        (search_text, entry_id),
                    )
                print(f"  CLR  {entry['stem']}:{entry['entry_index']}  {entry['name']!r}  (was {entry['address_street']!r})  #{num}")
                cleared += 1

    if not dry_run:
        print("Rebuilding FTS index...")
        cur.execute("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')")
        conn.commit()

    conn.close()
    print(f"\nDone. Fixed: {fixed}  Cleared: {cleared}  Skipped: {skipped}")


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    if dry:
        print("DRY RUN — no changes written.\n")
    fix_name_equals_street(dry_run=dry)
