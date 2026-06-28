#!/usr/bin/env python3
"""
Build web/data/adresboek.sqlite from pipeline outputs:

  output/json/<stem>.json           per-page entries (with bboxes)
  output/overrides/<stem>.json      CRM corrections (merged at build time)
  output/geocoded/addresses.json    PDOK geocoding results
  output/combined/page_manifest.json (unused — section comes from per-page JSON)

Schema: pages, entries (+ FTS5 mirror), cross_references.
Idempotent: drops + recreates everything.

Run: .venv/bin/python scripts/build_db.py
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import sqlite3
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from pipeline.json_export import _collect_entries_for_index  # noqa: E402

JSON_DIR = ROOT / "output" / "json"
OVERRIDES_DIR = ROOT / "output" / "overrides"
GEOCODED_PATH = ROOT / "output" / "geocoded" / "addresses.json"
BAG_BUILDINGS_PATH = ROOT / "output" / "bag" / "buildings.geojson"
BAG_MATCH_PATH = ROOT / "output" / "bag" / "match.json"
DB_PATH = PROJECT_ROOT / "data" / "adresboek.sqlite"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("build_db")


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def strip_accents(value: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    )


SIDE_MARKER_RE = re.compile(
    r"(?:^|\s|\()"
    r"(?:"
    r"(?:n|noord|noordelijk(?:e)?|noordzijde)\s*\.?\s*z(?:ijde)?\.?|"
    r"(?:z|zuid|zuidelijk(?:e)?|zuidzijde)\s*\.?\s*z(?:ijde)?\.?|"
    r"(?:o|oost|oostelijk(?:e)?|oostzijde)\s*\.?\s*z(?:ijde)?\.?|"
    r"(?:w|west|westelijk(?:e)?|westzijde)\s*\.?\s*z(?:ijde)?\.?|"
    r"nz|zz|oz|wz|"
    r"noordzijde|zuidzijde|oostzijde|westzijde|"
    r"noordelijke|zuidelijke|oostelijke|westelijke"
    r")"
    r"(?:\)|$|\s)",
)

DISPLAY_STREET_CORRECTIONS = {
    "musschengang": "Mussengang",
    "cortinglaan": "Cortinghlaan",
    "h l wicherstraat": "H. L. Wichersstraat",
    "driehovensteeg": "Driehovenstraat",
    "j w fristostraat": "Johan Willem Frisostraat",
    "j w frisostraat": "Johan Willem Frisostraat",
    "joh w frisostraat": "Johan Willem Frisostraat",
    "frans straatweg": "Friesestraatweg",
    "hoornschediep": "Hoornsediep",
    "hoornsche diep": "Hoornsediep",
    "hoornsche-diep": "Hoornsediep",
    "hoornschedijk": "Hoornsedijk",
    "hoornsche dijk": "Hoornsedijk",
    "hoornsche-dijk": "Hoornsedijk",
    "l henriettestraat": "Louise Henriëttestraat",
    "noorderstationstraat": "Noorderstationsstraat",
    "helperwestsingel": "Helper Westsingel",
    "helperoostsingel": "Helper Oostsingel",
    "helperweststraat": "Helper Weststraat",
    "helperbrink": "Helper Brink",
    "bleekerstraat": "Blekerstraat",
    "stationstraat": "Stationsstraat",
    "roodeweeshuisstraat": "Rodeweeshuisstraat",
    "a-kerkstraat": "Akerkstraat",
    "a kerkstraat": "Akerkstraat",
    "a-kerkhof": "Akerkhof",
    "a kerkhof": "Akerkhof",
    "a-straat": "Astraat",
    "a straat": "Astraat",
    "petrus hendrikz straat": "Petrus Hendrikszstraat",
    "petrus hendrikz-straat": "Petrus Hendrikszstraat",
    "petrus hendrikzstraat": "Petrus Hendrikszstraat",
    "petrus hendriksstraat": "Petrus Hendrikszstraat",
    "zaagmulderswegje": "Zaagmuldersweg",
    "loopendediep": "Lopendediep",
    "schuitemakerstraat": "Schuitemakersstraat",
    "sterreboschstraat": "Sterrebosstraat",
    "van speijkstraat": "Van Speykstraat",
    "van julsingastraat": "Van Julsinghastraat",
    "koninginelaan": "Koninginnelaan",
    "j goeverneurstraat": "Jan Goeverneurstraat",
    "jan gouverneurstraat": "Jan Goeverneurstraat",
    "tusschen beide markten": "Tussen beide Markten",
    "u emmiussingel": "Ubbo Emmiussingel",
    "fokkingedwarsstraat": "Folkingedwarsstraat",
    "gerebrant bakkerstraat": "Gerbrand Bakkerstraat",
}

NIEUWE_EBBINGESTRAAT_COMPACT_KEYS = {
    f"{prefix}{suffix}"
    for prefix in (
        "n",
        "nw",
        "nieuwe",
        "noord",
        "noordzijde",
        "noorder",
        "noordelijke",
    )
    for suffix in (
        "ebbingestraat",
        "ebbingestr",
        "ebbingestra",
        "ebbingestaat",
        "ebbstr",
        "ebbstraat",
    )
}
NIEUWE_EBBINGESTRAAT_MENTION_RE = re.compile(
    r"\b(?:(?:n|nw)\.?\s*|nieuwe[-\s]+|noord(?:zijde|er|elijke)?[-\s]*)"
    r"ebb(?:\.?\s*|(?:ing|inge)[-\s]*)"
    r"(?:estraat|estr\.?|str\.?|straat|estaat)",
    re.IGNORECASE,
)

# Boteringestraat is always either Oude (south end) or Nieuwe (north end).
# The LLM mis-expands "N./O." OCR abbreviations to "Noordzijde/Oostzijde", which
# the side-marker stripper would otherwise erase. Intercept by compact key
# (alphanumerics only) before that strip runs.
_BOTERINGESTRAAT_SUFFIXES = (
    "boteringestraat",
    "boteringestr",
    "boteringestra",
    "boteringestaat",
    "boteringetraat",   # OCR drop of the 's'
    "botstr",
    "botstraat",
)
NIEUWE_BOTERINGESTRAAT_COMPACT_KEYS = {
    f"{prefix}{suffix}"
    for prefix in (
        "n",
        "nw",
        "nieuwe",
        "noord",
        "noordzijde",
        "noorder",
        "noordelijke",
    )
    for suffix in _BOTERINGESTRAAT_SUFFIXES
}
OUDE_BOTERINGESTRAAT_COMPACT_KEYS = {
    f"{prefix}{suffix}"
    for prefix in (
        "o",
        "ou",
        "oude",
        "oost",
        "ooster",
        "oostzijde",
        "oostelijke",
        "u",  # OCR misread of 'O.'
    )
    for suffix in _BOTERINGESTRAAT_SUFFIXES
}


def normalize_street_key(value: str | None) -> str:
    if not value:
        return ""
    key = raw_street_key(value)
    previous = None
    while previous != key:
        previous = key
        key = SIDE_MARKER_RE.sub(" ", key)
        key = re.sub(r"\s+", " ", key).strip()
    return key


def raw_street_key(value: str | None) -> str:
    if not value:
        return ""
    key = strip_accents(value).lower().strip()
    key = re.sub(r"[^a-z0-9 \-']", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    return key


def compact_street_key(value: str | None) -> str:
    if not isinstance(value, str) or not value:
        return ""
    return re.sub(r"[^a-z0-9]", "", strip_accents(value).lower())


def special_street_correction(value: str | None) -> str | None:
    key = compact_street_key(value)
    if key in NIEUWE_EBBINGESTRAAT_COMPACT_KEYS:
        return "Nieuwe Ebbingestraat"
    if key in NIEUWE_BOTERINGESTRAAT_COMPACT_KEYS:
        return "Nieuwe Boteringestraat"
    if key in OUDE_BOTERINGESTRAAT_COMPACT_KEYS:
        return "Oude Boteringestraat"
    return None


def replace_nieuwe_ebbingestraat_mentions(value: str | None) -> str | None:
    if not isinstance(value, str) or not value:
        return value
    return NIEUWE_EBBINGESTRAAT_MENTION_RE.sub("Nieuwe Ebbingestraat", value)


def corrected_street_name(value: str | None) -> str | None:
    if not value:
        return value
    special = special_street_correction(value)
    if special:
        return special
    key = normalize_street_key(value)
    corrected = DISPLAY_STREET_CORRECTIONS.get(key)
    if corrected:
        return corrected
    if key != raw_street_key(value):
        return key.title()
    return value.strip()


def correct_entry_address(entry: dict) -> dict:
    merged = dict(entry)
    street_source = (
        merged.get("address_street_expanded")
        or merged.get("address_street")
        or ""
    )
    corrected = corrected_street_name(street_source)
    street_source_special = special_street_correction(street_source)
    explicit_street_correction = special_street_correction(merged.get("address_street"))
    if corrected and (corrected != street_source or explicit_street_correction):
        corrected = explicit_street_correction or corrected

        if merged.get("address_street"):
            merged["address_street"] = corrected
        if merged.get("address_street_expanded") is not None:
            merged["address_street_expanded"] = corrected

        number = merged.get("address_number") or ""
        if not (street_source_special or explicit_street_correction) or not merged.get("address_full"):
            merged["address_full"] = " ".join(str(s) for s in (corrected, number) if s).strip()

    for field in (
        "address_street",
        "address_street_expanded",
        "address_number",
        "address_full",
    ):
        replaced = replace_nieuwe_ebbingestraat_mentions(merged.get(field))
        if replaced != merged.get(field):
            merged[field] = replaced

    return merged


SCHEMA = """
DROP TABLE IF EXISTS entries_fts;
DROP TABLE IF EXISTS cross_references;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS pages;
DROP TABLE IF EXISTS buildings;

CREATE TABLE pages (
    id INTEGER PRIMARY KEY,
    scan_file TEXT UNIQUE NOT NULL,
    stem TEXT UNIQUE NOT NULL,
    page_number INTEGER,
    section TEXT,
    width INTEGER,
    height INTEGER,
    header_text TEXT,
    footer_text TEXT
);

CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id),
    entry_index INTEGER NOT NULL,
    stable_id TEXT UNIQUE NOT NULL,    -- <stem>:<idx>
    name TEXT,
    initials TEXT,
    name_prefix TEXT,
    name_prefix_expanded TEXT,
    entity_type TEXT,
    role TEXT,
    parent_organization TEXT,
    description TEXT,
    occupation TEXT,
    occupation_expanded TEXT,
    address_street TEXT,
    address_street_expanded TEXT,
    address_number TEXT,
    address_full TEXT,
    address_full_normalized TEXT,
    phone TEXT,
    notes TEXT,
    entry_bbox TEXT,                   -- JSON [x1,y1,x2,y2]
    name_bbox TEXT,
    address_bbox TEXT,
    word_ids TEXT,
    name_word_ids TEXT,
    address_word_ids TEXT,
    lat REAL,
    lng REAL,
    geocode_score REAL,
    geocode_type TEXT,                 -- adres | weg | gemeente | woonplaats | postcode | buurt
    geocode_matched TEXT,
    geocode_flags TEXT,                -- JSON array (e.g. ["uncertain"])
    flag_verified INTEGER DEFAULT 0,
    flag_needs_review INTEGER DEFAULT 0,
    flag_bbox_unreliable INTEGER DEFAULT 0,
    fingerprint TEXT,
    edited_at TEXT,
    searchable_text TEXT,
    pand_id TEXT                       -- BAG building id (NULL if no match)
);

CREATE INDEX idx_entries_page ON entries(page_id);
CREATE INDEX idx_entries_coords ON entries(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX idx_entries_address_norm ON entries(address_full_normalized);
CREATE INDEX idx_entries_name ON entries(name);
CREATE INDEX idx_entries_pand ON entries(pand_id) WHERE pand_id IS NOT NULL;

CREATE TABLE buildings (
    pand_id TEXT PRIMARY KEY,
    geometry TEXT NOT NULL,            -- GeoJSON geometry as text
    bbox_west REAL,
    bbox_south REAL,
    bbox_east REAL,
    bbox_north REAL,
    centroid_lat REAL,
    centroid_lng REAL,
    address_count INTEGER NOT NULL,    -- VBOs in this pand
    entry_count INTEGER NOT NULL,      -- 1926 entries linked to this pand
    bouwjaar INTEGER                   -- BAG oorspronkelijk bouwjaar (NULL if unknown)
);
CREATE INDEX idx_buildings_bbox ON buildings(bbox_west, bbox_south, bbox_east, bbox_north);

CREATE VIRTUAL TABLE entries_fts USING fts5(
    name, initials, name_prefix_expanded,
    entity_type, role, parent_organization, description,
    occupation, occupation_expanded,
    address_street, address_street_expanded, address_number, address_full,
    searchable_text,
    content='entries',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE cross_references (
    id INTEGER PRIMARY KEY,
    source_entry_id INTEGER NOT NULL REFERENCES entries(id),
    target_text TEXT,
    target_page_number INTEGER,
    raw TEXT
);
CREATE INDEX idx_xref_source ON cross_references(source_entry_id);

-- FTS5 triggers to keep entries_fts in sync with entries
CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, name, initials, name_prefix_expanded, entity_type, role, parent_organization, description, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES (new.id, new.name, new.initials, new.name_prefix_expanded, new.entity_type, new.role, new.parent_organization, new.description, new.occupation, new.occupation_expanded, new.address_street, new.address_street_expanded, new.address_number, new.address_full, new.searchable_text);
END;

CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, initials, name_prefix_expanded, entity_type, role, parent_organization, description, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES ('delete', old.id, old.name, old.initials, old.name_prefix_expanded, old.entity_type, old.role, old.parent_organization, old.description, old.occupation, old.occupation_expanded, old.address_street, old.address_street_expanded, old.address_number, old.address_full, old.searchable_text);
END;

CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, initials, name_prefix_expanded, entity_type, role, parent_organization, description, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES ('delete', old.id, old.name, old.initials, old.name_prefix_expanded, old.entity_type, old.role, old.parent_organization, old.description, old.occupation, old.occupation_expanded, old.address_street, old.address_street_expanded, old.address_number, old.address_full, old.searchable_text);
  INSERT INTO entries_fts(rowid, name, initials, name_prefix_expanded, entity_type, role, parent_organization, description, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES (new.id, new.name, new.initials, new.name_prefix_expanded, new.entity_type, new.role, new.parent_organization, new.description, new.occupation, new.occupation_expanded, new.address_street, new.address_street_expanded, new.address_number, new.address_full, new.searchable_text);
END;
"""


# ── Override merge (mirrors web/lib/overrides.ts → applyOverride) ─────────────


def apply_override(entry: dict, ov: dict | None) -> dict:
    if not ov:
        return entry
    merged = {**entry, **(ov.get("fields") or {})}
    bbox_ov = ov.get("bbox", {}).get("value") if ov.get("bbox") else None
    if bbox_ov:
        merged["entry_bbox"] = bbox_ov
    if ov.get("flags"):
        merged["_flags_override"] = ov["flags"]
    if ov.get("fingerprint"):
        merged["_fingerprint"] = ov["fingerprint"]
    if ov.get("edited_at"):
        merged["_edited_at"] = ov["edited_at"]
    fields = ov.get("fields") or {}
    if (
        fields
        and "address_full" not in fields
        and any(k in fields for k in ("address_street", "address_street_expanded", "address_number"))
    ):
        street = merged.get("address_street_expanded") or merged.get("address_street") or ""
        num = merged.get("address_number") or ""
        merged["address_full"] = " ".join([s for s in (street, num) if s]).strip()
    # Refresh searchable_text — same fields the FTS index uses
    merged["searchable_text"] = " ".join(
        str(merged.get(k) or "")
        for k in (
            "name",
            "initials",
            "name_prefix",
            "name_prefix_expanded",
            "entity_type",
            "role",
            "parent_organization",
            "description",
            "occupation",
            "occupation_expanded",
            "address_street",
            "address_street_expanded",
            "address_number",
            "address_full_normalized",
        )
    ).strip()
    return merged


def normalize_address(addr: str | None) -> str | None:
    if not addr:
        return None
    s = addr.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s or None


def fingerprint(entry: dict) -> str:
    norm = lambda v: re.sub(r"\s+", " ", (v or "").lower()).strip() if isinstance(v, str) else ""
    sig = "|".join([
        norm(entry.get("name")),
        norm(entry.get("initials")),
        norm(entry.get("name_prefix")),
        norm(entry.get("address_street_expanded") or entry.get("address_street")),
        norm(entry.get("address_number")),
        norm(entry.get("occupation_expanded") or entry.get("occupation")),
    ])
    return "sha1:" + hashlib.sha1(sig.encode("utf-8")).hexdigest()


def jdumps(value) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


# ── Build ─────────────────────────────────────────────────────────────────────


def main() -> None:
    if not JSON_DIR.exists():
        log.error(f"Missing input dir: {JSON_DIR}")
        sys.exit(1)
    geocoded: dict[str, dict] = {}
    if GEOCODED_PATH.exists():
        geocoded = json.loads(GEOCODED_PATH.read_text(encoding="utf-8"))
        log.info(f"Loaded {len(geocoded)} geocoded address keys")
    else:
        log.warning("No geocoded file — entries will have NULL lat/lng")

    # BAG match: stable_id -> pand_id; pand_id -> entry_count
    pand_for_entry: dict[str, str] = {}
    pand_entry_count: dict[str, int] = {}
    if BAG_MATCH_PATH.exists():
        match = json.loads(BAG_MATCH_PATH.read_text(encoding="utf-8"))
        for pand_id, b in match.items():
            if pand_id == "_summary":
                continue
            cnt = 0
            for _addr, info in b.get("addresses", {}).items():
                for sid in info.get("entries", []):
                    pand_for_entry[sid] = pand_id
                    cnt += 1
            pand_entry_count[pand_id] = cnt
        log.info(f"Loaded BAG match: {len(pand_for_entry)} entries → {len(pand_entry_count)} pand")
    else:
        log.warning("No BAG match file — entries will have NULL pand_id")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    cur = conn.cursor()
    t0 = time.time()

    page_files = sorted(JSON_DIR.glob("*.json"))
    log.info(f"Importing {len(page_files)} pages")

    n_entries = 0
    n_geocoded = 0
    n_overridden = 0
    n_xrefs = 0

    for pf in page_files:
        page = json.loads(pf.read_text(encoding="utf-8"))
        stem = pf.stem
        section = page.get("section", "unknown")
        dims = page.get("dimensions") or {}
        header = (page.get("header") or {}).get("text") or None
        footer = (page.get("footer") or {}).get("text") or None
        cur.execute(
            """INSERT INTO pages
               (scan_file, stem, page_number, section, width, height, header_text, footer_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                page.get("scan_file") or f"{stem}.jpg",
                stem,
                page.get("page_number"),
                section,
                dims.get("width"),
                dims.get("height"),
                header,
                footer,
            ),
        )
        page_id = cur.lastrowid

        ov_path = OVERRIDES_DIR / f"{stem}.json"
        overrides = {}
        if ov_path.exists():
            try:
                overrides = json.loads(ov_path.read_text(encoding="utf-8"))
            except Exception as e:
                log.warning(f"  override unreadable for {stem}: {e}")

        entries = _collect_entries_for_index(page)
        for idx, raw_entry in enumerate(entries):
            stable_id = f"{stem}:{idx}"
            ov = overrides.get(stable_id)
            entry = apply_override(raw_entry, ov)
            if ov:
                n_overridden += 1

            original_address_norm = normalize_address(entry.get("address_full"))
            entry = correct_entry_address(entry)
            address_full = entry.get("address_full")
            address_norm = normalize_address(address_full)

            geo = geocoded.get(address_norm) if address_norm else None
            if not geo and original_address_norm and original_address_norm != address_norm:
                geo = geocoded.get(original_address_norm)
            geo_lat = geo.get("lat") if geo and geo.get("status") == "ok" else None
            geo_lng = geo.get("lng") if geo and geo.get("status") == "ok" else None
            if geo_lat is not None:
                n_geocoded += 1

            flags = entry.get("_flags_override") or {}

            cur.execute(
                """INSERT INTO entries (
                       page_id, entry_index, stable_id,
                       name, initials, name_prefix, name_prefix_expanded,
                       entity_type, role, parent_organization, description,
                       occupation, occupation_expanded,
                       address_street, address_street_expanded, address_number,
                       address_full, address_full_normalized,
                       phone, notes,
                       entry_bbox, name_bbox, address_bbox,
                       word_ids, name_word_ids, address_word_ids,
                       lat, lng, geocode_score, geocode_type, geocode_matched, geocode_flags,
                       flag_verified, flag_needs_review, flag_bbox_unreliable,
                       fingerprint, edited_at, searchable_text,
                       pand_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                           ?, ?, ?, ?, ?, ?,
                           ?)""",
                (
                    page_id, idx, stable_id,
                    entry.get("name"),
                    entry.get("initials"),
                    entry.get("name_prefix"),
                    entry.get("name_prefix_expanded"),
                    entry.get("entity_type"),
                    entry.get("role"),
                    entry.get("parent_organization"),
                    entry.get("description"),
                    entry.get("occupation"),
                    entry.get("occupation_expanded"),
                    entry.get("address_street"),
                    entry.get("address_street_expanded"),
                    entry.get("address_number"),
                    address_full,
                    address_norm,
                    entry.get("phone"),
                    entry.get("notes"),
                    jdumps(entry.get("entry_bbox")),
                    jdumps(entry.get("name_bbox")),
                    jdumps(entry.get("address_bbox")),
                    jdumps(entry.get("word_ids")),
                    jdumps(entry.get("name_word_ids")),
                    jdumps(entry.get("address_word_ids")),
                    geo_lat, geo_lng,
                    geo.get("score") if geo else None,
                    geo.get("type") if geo else None,
                    geo.get("matched") if geo else None,
                    jdumps(geo.get("flags")) if geo else None,
                    1 if flags.get("verified") else 0,
                    1 if flags.get("needs_review") else 0,
                    1 if flags.get("bbox_unreliable") else 0,
                    entry.get("_fingerprint") or fingerprint(entry),
                    entry.get("_edited_at"),
                    entry.get("searchable_text"),
                    pand_for_entry.get(stable_id),
                ),
            )
            entry_id = cur.lastrowid
            n_entries += 1

            for xref in entry.get("cross_references") or []:
                cur.execute(
                    """INSERT INTO cross_references (source_entry_id, target_text, target_page_number, raw)
                       VALUES (?, ?, ?, ?)""",
                    (
                        entry_id,
                        xref.get("text") if isinstance(xref, dict) else None,
                        xref.get("page_number") if isinstance(xref, dict) else None,
                        json.dumps(xref, ensure_ascii=False) if not isinstance(xref, str) else xref,
                    ),
                )
                n_xrefs += 1

        if (page_files.index(pf) + 1) % 100 == 0:
            log.info(f"  imported {page_files.index(pf) + 1}/{len(page_files)} pages")

    n_buildings = 0
    if BAG_BUILDINGS_PATH.exists() and pand_entry_count:
        log.info("Loading BAG buildings.geojson...")
        bag = json.loads(BAG_BUILDINGS_PATH.read_text(encoding="utf-8"))
        for feat in bag["features"]:
            pid = feat["properties"]["pand_id"]
            ec = pand_entry_count.get(pid, 0)
            if ec == 0:
                continue  # only persist buildings that have at least one record
            geom = feat["geometry"]
            # Compute bbox + centroid from polygon coords (multipolygon / polygon)
            coords_iter = []
            if geom["type"] == "Polygon":
                for ring in geom["coordinates"]:
                    coords_iter.extend(ring)
            elif geom["type"] == "MultiPolygon":
                for poly in geom["coordinates"]:
                    for ring in poly:
                        coords_iter.extend(ring)
            xs = [c[0] for c in coords_iter]
            ys = [c[1] for c in coords_iter]
            bbox_w, bbox_e = min(xs), max(xs)
            bbox_s, bbox_n = min(ys), max(ys)
            cur.execute(
                """INSERT INTO buildings
                   (pand_id, geometry, bbox_west, bbox_south, bbox_east, bbox_north,
                    centroid_lat, centroid_lng, address_count, entry_count, bouwjaar)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    pid,
                    json.dumps(geom, ensure_ascii=False),
                    bbox_w, bbox_s, bbox_e, bbox_n,
                    (bbox_s + bbox_n) / 2,
                    (bbox_w + bbox_e) / 2,
                    feat["properties"].get("address_count", 0),
                    ec,
                    feat["properties"].get("bouwjaar"),
                ),
            )
            n_buildings += 1
        log.info(f"  inserted {n_buildings} buildings (with ≥1 entry)")

    log.info("Clustering persons...")
    import sys
    sys.path.append(str(ROOT / "scripts"))
    import cluster_persons
    cluster_persons.cluster(conn)

    log.info("Rebuild FTS5 index...")
    cur.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")

    log.info("ANALYZE + VACUUM...")
    conn.commit()
    conn.execute("ANALYZE")
    conn.execute("VACUUM")
    conn.close()

    elapsed = time.time() - t0
    size_mb = DB_PATH.stat().st_size / 1_000_000
    log.info("=" * 60)
    log.info(f"Done in {elapsed:.1f}s")
    log.info(f"  pages:       {len(page_files)}")
    log.info(f"  entries:     {n_entries}")
    log.info(f"  geocoded:    {n_geocoded} ({100*n_geocoded/max(n_entries,1):.1f}%)")
    log.info(f"  pand-matched:{len(pand_for_entry)} ({100*len(pand_for_entry)/max(n_entries,1):.1f}%)")
    log.info(f"  buildings:   {n_buildings}")
    log.info(f"  overridden:  {n_overridden}")
    log.info(f"  xrefs:       {n_xrefs}")
    log.info(f"  output:      {display_path(DB_PATH)} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
