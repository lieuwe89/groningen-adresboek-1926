"""Recompute entry/name/address boxes in output/json/*.json without the over-tall OCR words.

The 1854 book prints a ditto mark for a repeated wijk letter. OCR often joins that mark with the letter on the
next row into one word box two rows high; both entries then get a box that covers the other row, and a click on
the scan selects the wrong entry. Here a word taller than 1.25x the page's median word height does not count for
a box (unless the entry has no other words). Idempotent; run after apply_omnummering.py, before build_db.py.

shortcut: fixes the exported JSON, not pipeline/align.py (which snaps to OCR line boxes that contain the same
tall words); move the rule there when the alignment stage is re-run for this book.

Usage:  ADRESBOEK_BOOK=1854 python scripts/fix_tall_word_bboxes.py
"""

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.config import JSON_DIR  # noqa: E402


def box(ids, words, limit):
    bbs = [words[i] for i in ids or [] if i in words]
    bbs = [b for b in bbs if b[3] - b[1] <= limit] or bbs
    return [min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs)] if bbs else None


def misclicks(entries) -> int:
    """Entries where a click on the middle of the name selects another entry (the viewer takes the first box that contains the click)."""
    n = 0
    for i, e in enumerate(entries):
        nb = e.get("name_bbox")
        if not nb or not e.get("entry_bbox"):
            continue
        cx, cy = (nb[0] + nb[2]) / 2, (nb[1] + nb[3]) / 2
        hit = next((j for j, o in enumerate(entries) if o.get("entry_bbox") and o["entry_bbox"][0] <= cx <= o["entry_bbox"][2]
                    and o["entry_bbox"][1] <= cy <= o["entry_bbox"][3]), None)
        n += hit != i
    return n


def main() -> None:
    before = after = total = 0
    for f in sorted(JSON_DIR.glob("*.json")):
        page = json.loads(f.read_text(encoding="utf-8"))
        if page.get("section") != "occupation_register" or not page.get("words"):
            continue
        words = {w["id"]: w["bbox"] for w in page["words"]}
        limit = 1.25 * statistics.median(b[3] - b[1] for b in words.values())
        entries = [e for occ in page.get("occupations") or [] for e in occ.get("entries") or []]
        before += misclicks(entries)
        for e in entries:
            for field, ids in (("entry_bbox", "word_ids"), ("name_bbox", "name_word_ids"), ("address_bbox", "address_word_ids")):
                e[field] = box(e.get(ids), words, limit) or e.get(field)
        after += misclicks(entries)
        total += len(entries)
        f.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
    print(f"{total} entries; a click on the name selects another entry: {before} before, {after} after")


if __name__ == "__main__":
    main()
