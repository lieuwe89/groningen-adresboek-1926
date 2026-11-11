"""Turn an archive PDF (page images + hidden OCR text layer) into pipeline inputs.

Writes scans/<stem>_NNNN.jpg and output/hocr/<stem>_NNNN.ocr.json, so the pipeline
finds a warm OCR cache and never needs Surya: the vision LLM reads the image, the
PDF's own word boxes only supply the coordinates for the viewer overlay.

Usage:  ADRESBOEK_BOOK=1854 python scripts/pdf_to_scans.py <pdf> 1769_19527-1854
Needs poppler (pdftoppm, pdftotext) on PATH.
"""

import csv
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from PIL import Image  # noqa: E402

from pipeline.config import HOCR_DIR, SCANS_DIR  # noqa: E402

DPI = 300  # normalize_image() rescales anything that is not ~300 dpi; boxes must match


def box(row, s):
    x, y, w, h = (float(row[k]) for k in ("left", "top", "width", "height"))
    return [round(x * s), round(y * s), round((x + w) * s), round((y + h) * s)]


def main(pdf: str, stem: str) -> None:
    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    HOCR_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-r", str(DPI), "-jpeg", "-jpegopt", "quality=90", pdf, str(SCANS_DIR / "tmp")], check=True)
    for n, f in enumerate(sorted(SCANS_DIR.glob("tmp-*.jpg")), 1):
        f.rename(SCANS_DIR / f"{stem}_{n:04d}.jpg")
    n_scans = len(list(SCANS_DIR.glob(f"{stem}_*.jpg")))

    # -tsv, not -bbox-layout: poppler 26.04 aborts on this PDF's HTML header.
    tsv = HOCR_DIR / "_textlayer.tsv"
    subprocess.run(["pdftotext", "-tsv", pdf, str(tsv)], check=True)
    pages: dict[int, dict] = {}
    with tsv.open(encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh, delimiter="\t", quoting=csv.QUOTE_NONE):
            level, n = row["level"], int(row["page_num"])
            if level == "1":
                with Image.open(SCANS_DIR / f"{stem}_{n:04d}.jpg") as im:
                    width, height = im.size
                pages[n] = p = {"width": width, "height": height, "s": width / float(row["width"]), "blocks": [], "w": 0}
            elif level == "3":
                p["blocks"].append({"id": f"b_{len(p['blocks']):03d}", "bbox": box(row, p["s"]), "lines": []})
            elif level == "4":
                b = p["blocks"][-1]
                b["lines"].append({"id": f"l_{len(p['blocks']) - 1:03d}_{len(b['lines']):03d}", "bbox": box(row, p["s"]), "words": []})
            elif level == "5" and row["text"].strip():
                p["w"] += 1
                line = p["blocks"][-1]["lines"][-1]
                line["words"].append({"id": f"w_{p['w']:04d}", "text": row["text"].strip(), "bbox": box(row, p["s"]), "confidence": 50, "line_id": line["id"]})
    tsv.unlink()

    assert len(pages) == n_scans, f"text layer has {len(pages)} pages, images {n_scans}"
    for n, p in pages.items():
        name = f"{stem}_{n:04d}.jpg"
        blocks = [{**b, "lines": [ln for ln in b["lines"] if ln["words"]]} for b in p["blocks"]]
        payload = {"schema_version": 2, "scan_file": name, "width": p["width"], "height": p["height"], "blocks": [b for b in blocks if b["lines"]]}
        (HOCR_DIR / f"{stem}_{n:04d}.ocr.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"{n_scans} pages, {sum(p['w'] for p in pages.values())} words → {SCANS_DIR} and {HOCR_DIR}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
