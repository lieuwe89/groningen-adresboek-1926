import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "data" / "adresboek.sqlite"

# Map of historical/OCR variations to modern normalized names
NORMALIZATION_MAP = {
    "Nw. weg": "Nieuweweg",
    "Nw. Weg": "Nieuweweg",
    "n. weg": "Nieuweweg",
    "N. weg": "Nieuweweg",
    "N. Weg": "Nieuweweg",
    "Noorderweg": "Nieuweweg", # Mis-expansion of N. Weg
    "Noorder Weg": "Nieuweweg",
    "Noord Weg": "Nieuweweg",
    "Noord-Weg": "Nieuweweg",
    "Noordweg": "Nieuweweg",
    "Noordzijde Weg": "Nieuweweg",
    "Noordelijke Weg": "Nieuweweg",
    "Nieuwe weg": "Nieuweweg",
    "Nieuwe Weg": "Nieuweweg",
    "Nieuwe Weg.": "Nieuweweg",
    "A-weg": "Aweg",
    "A-WEG": "Aweg",
    "Fr. Straatweg": "Friesestraatweg",
    "Fr. straatweg": "Friesestraatweg",
    "Fr. Straatw.": "Friesestraatweg",
    "Fransestraatweg": "Friesestraatweg",
    "Frans Straatweg": "Friesestraatweg",
    "Franse Straatweg": "Friesestraatweg",
    "Fransche Straatweg": "Friesestraatweg",
    "Friesche Straatweg": "Friesestraatweg",
    "Friesche straatweg": "Friesestraatweg",
    "Frieschestraatweg": "Friesestraatweg",
    "Frederik Straatweg": "Friesestraatweg",
    "Frederikstraatweg": "Friesestraatweg",
    "Frederikstraat Straatweg": "Friesestraatweg",
    "Fokkerstraat": "A.P. Fokkerstraat",
    "Fokkerstr.": "A.P. Fokkerstraat",
    "A. P. Fokkerstraat": "A.P. Fokkerstraat",
    "Anna Paulowna Fokkerstraat": "A.P. Fokkerstraat",
    "Abraham Pieter Fokkerstraat": "A.P. Fokkerstraat",
    "Oude Weg": "Oudeweg",
    "Rode Weg": "Rodeweg",
    "Roode Weg": "Rodeweg",
    "Roode weg": "Rodeweg",
    "Grote Adolfstraat": "Graaf Adolfstraat",
    "Groote Adolfstraat": "Graaf Adolfstraat",
    "Gr. Adolfstraat": "Graaf Adolfstraat",
    "Gr. Adolfstr.": "Graaf Adolfstraat",
    "Gr. Adolf- straat": "Graaf Adolfstraat"
}

SEARCHABLE_COLUMNS = (
    "name",
    "initials",
    "name_prefix",
    "name_prefix_expanded",
    "occupation",
    "occupation_expanded",
    "address_street",
    "address_street_expanded",
    "address_number",
    "address_full",
    "address_full_normalized",
)


def clean(value):
    return value.strip() if isinstance(value, str) else ""


def normalized_street(address_street, address_street_expanded):
    for value in (address_street, address_street_expanded):
        street = clean(value)
        street_without_trailing_period = street.rstrip(".")
        for old, new in sorted(NORMALIZATION_MAP.items(), key=lambda item: len(item[0]), reverse=True):
            if street == old or street_without_trailing_period == old:
                return new
            for separator in (" ", " ("):
                prefix = f"{old}{separator}"
                if street.startswith(prefix):
                    suffix = street[len(old):]
                    return f"{new}{suffix}"
    return None


def normalize_address(street, number):
    parts = [clean(street), clean(number)]
    return " ".join(part for part in parts if part)


def normalize_search_text(row):
    return " ".join(clean(row[column]) for column in SEARCHABLE_COLUMNS if clean(row[column]))

def normalize():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    total_updated = 0

    print("Normalizing street names, display addresses, searchable text, and FTS...")
    cursor.execute(
        """
        SELECT id, name, initials, name_prefix, name_prefix_expanded,
               occupation, occupation_expanded, address_street,
               address_street_expanded, address_number, address_full,
               address_full_normalized
        FROM entries
        """
    )
    rows = cursor.fetchall()
    columns = [description[0] for description in cursor.description]

    for values in rows:
        row = dict(zip(columns, values))
        new_street = normalized_street(row["address_street"], row["address_street_expanded"])
        if not new_street:
            continue

        row["address_street_expanded"] = new_street
        row["address_full"] = normalize_address(new_street, row["address_number"])
        row["address_full_normalized"] = re.sub(r"\s+", " ", row["address_full"].lower()).strip()
        row["searchable_text"] = normalize_search_text(row)

        cursor.execute(
            """
            UPDATE entries
            SET address_street_expanded = ?,
                address_full = ?,
                address_full_normalized = ?,
                searchable_text = ?
            WHERE id = ?
            """,
            (
                row["address_street_expanded"],
                row["address_full"],
                row["address_full_normalized"],
                row["searchable_text"],
                row["id"],
            ),
        )
        total_updated += cursor.rowcount

    cursor.execute("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')")

    conn.commit()
    conn.close()
    print(f"Finished. Total entries updated (by street variation): {total_updated}")

if __name__ == "__main__":
    normalize()
