"""Adresboek of Naam-register van fabrijkanten, kooplieden, winkeliers … te Groningen (Oomkens, 1854).

Loaded by pipeline/config.py when ADRESBOEK_BOOK=1854.
Scans and word boxes come from the archive PDF: scripts/pdf_to_scans.py.
"""

from pathlib import Path

DATA_ROOT = Path.home() / "projects" / "groningen-adresboek-1854"

OPENROUTER_MODEL = "google/gemini-3.8-flash"
OPENROUTER_FALLBACK_MODEL = "google/gemini-3.8-flash"
# Provider-default thinking spent ~47k output tokens (5 min) on one 35-line page.
OPENROUTER_REASONING_EFFORT = "low"

SCAN_TO_PAGE_OFFSET = 2  # scan 10 = printed page 8

SECTION_MAP = [
    # (start_page, end_page, section_type, prompt_file) — printed page numbers
    (1, 4, "front_matter", "generic.txt"),  # cover, title page, Voorberigt
    (5, 100, "occupation_register", "occupation_register_1854.txt"),
    (101, 127, "name_index", "generic.txt"),  # Alphabetische naamlijst → Bladz.
    (128, 135, "advertisement", "advertisement.txt"),  # publisher's list
]
