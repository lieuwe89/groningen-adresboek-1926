# Handoff: Groningen Adresboek 1926 — Pilot Complete

This pipeline extracts structured data from scanned address books — combining **Surya OCR** (transformer-based, word-level bounding boxes) with a **vision LLM via OpenRouter** (Gemini 2.5 Flash Lite by default) — and exports per-page JSON + ALTO XML plus combined search/address/street indexes.

**The pilot run on the 1926 Groningen address book is complete.** This document hands off the current state, the lessons that shaped the architecture, and what to do for book #2.

---

## 1. Pilot results (1926 Groningen)

| Metric | Value |
|---|---|
| Pages processed | **838 / 838** (100%) |
| Total entries | **60,783** |
| Unique addresses | 36,279 |
| Unique streets | 4,716 |
| Cross-references | 218 |
| Tokens (in/out) | 8.25M / 16.60M (total 24.85M) |
| LLM cost | **$7.49** (OpenRouter, gemini-2.5-flash-lite, with one fallback page on full 2.5-flash) |
| Wall time | ~24h OCR (CPU, 2 workers) + ~12.5h LLM |

Section breakdown: 485 name-register, 196 street-register, 104 institutional, 37 occupation-register, 10 other, 6 advertisement.

Outputs are in `output/`:

- `output/json/<scan_stem>.json` — per-page aligned data with bounding boxes
- `output/alto/<scan_stem>.xml` — ALTO 4.x XML per page
- `output/hocr/<scan_stem>.ocr.json` — Surya cache (re-loadable, applies column reorder + bbox repair on read)
- `output/llm_raw/<scan_stem>.json` — raw LLM responses (pre-alignment, source of truth for resume)
- `output/llm_usage/<scan_stem>.json` — per-page token usage / cost telemetry
- `output/combined/{search,address,street,cross_reference}_index.json` — flattened indexes
- `output/combined/page_manifest.json` — page-level metadata
- `output/checkpoint.json` — completed/failed page lists for resume
- `output/logs/pipeline_*.log` — structured logs

---

## 2. How to run the next book

### 2.1 Prerequisites

- Python 3.10+
- `pip install -r requirements.txt` (Surya downloads models on first use, ~100 MB into `%LOCALAPPDATA%\datalab`)
- `pipeline/config_local.py` with at least:
  ```python
  OPENROUTER_API_KEY = "sk-or-v1-..."
  OPENROUTER_MODEL   = "google/gemini-2.5-flash-lite"  # primary
  LLM_PROVIDER       = "openrouter"
  ```

### 2.2 Configure the new book

Edit `pipeline/config.py` (or override in `config_local.py`):

- Drop scans in `scans/` (filename format: `archiveNumber_recordNumber-year_scanNumber.jpg`).
- Adjust `SCAN_TO_PAGE_OFFSET` so scan number minus offset ≈ printed page number. Verify by spot-comparing a few scans against printed page numbers in the headers — the pilot's offset of 2 was correct, but it's the kind of thing that's quietly wrong on a new book if you don't check.
- Adjust `SECTION_MAP` to match the new book's table of contents. Pages outside the map fall back to the generic prompt.

### 2.3 Pre-flight cost projection

Before kicking off the full run, project cost from a small spread sample:

```powershell
python pipeline/run_pipeline.py --preflight 5
```

This OCRs 5 evenly-spaced pages (front + middle + back) and reports projected full-book input/output tokens and cost. **Use ≥5 samples — fewer than that wildly under-projects** (the pilot's 2-page preflight projected $5.27, actual was $7.49, primarily because the 2 samples didn't include a dense street-register page).

### 2.4 Long unattended runs

Two things will quietly kill an overnight run:

1. **Closing the parent shell.** A pipeline started as a foreground child of an interactive shell (or a Claude Code agent) dies when that parent exits. Use `Start-Process -WindowStyle Hidden` so the process is detached:

   ```powershell
   $proj = "C:\path\to\repo"
   $out  = "$proj\output\logs\pipeline_$(Get-Date -Format 'yyyyMMdd_HHmmss').stdout.log"
   Start-Process -FilePath python -ArgumentList "-u","pipeline\run_pipeline.py" `
     -WorkingDirectory $proj -WindowStyle Hidden `
     -RedirectStandardOutput $out -RedirectStandardError "$out.err"
   ```

2. **Windows sleep.** Detachment survives shell exit, *not* OS suspend. Disable sleep on the machine before kicking off a multi-hour run.

### 2.5 Resumability

Every stage is crash-resilient now:

- OCR: per-page cache in `output/hocr/*.ocr.json`
- LLM: per-page raw responses in `output/llm_raw/*.json` (written immediately after each call)
- Alignment+export: per-page JSON+ALTO written incrementally; combined indexes rebuild from disk

If anything kills the process — network blip, OS crash, you closing a terminal — just rerun the same command. The pipeline detects what's already done and skips it. `--reprocess` forces a clean rerun.

### 2.6 Doubling OCR throughput

OCR is the long pole. On a 6c/12t CPU it runs ~2 min/page; ~24h for ~800 pages. PyTorch defaults to one thread per *physical* core (so Task Manager shows "50% CPU" because the hyperthreads are intentionally idle — that's optimal for matmul). **For real speedup, start a second worker** that processes pages from the back of the list:

```powershell
Start-Process -FilePath python -ArgumentList "-u","pipeline\ocr_worker_reverse.py" `
  -WorkingDirectory $proj -WindowStyle Hidden `
  -RedirectStandardOutput "$proj\output\logs\reverse_$(Get-Date -Format 'yyyyMMdd_HHmmss').log" `
  -RedirectStandardError "$proj\output\logs\reverse_err.log"
```

Both workers share the per-page OCR cache and meet in the middle. ~1.6–1.8× total throughput, ~3 GB extra RAM. (Real fix is GPU OCR — running on the planned NVIDIA DGX Spark — at which point one process saturates the device.)

---

## 3. Architecture as it actually is

5-stage pipeline driven by `pipeline/run_pipeline.py`:

```
JPEG scans
  → [1] discover (preprocess.py)
  → [2] Surya OCR (ocr.py)            ← cached per-page
  → [3] LLM correction & structuring  ← cached per-page (llm_raw)
       (llm.py, prompts/<section>.txt)
  → [4] Alignment (align.py)          ← link LLM word_ids → OCR bboxes
  → [5] Export (alto_export.py, json_export.py)  ← per-page + combined indexes
```

Key insight: the LLM gets both the scan image *and* a numbered list of OCR words. It returns structured entries that reference those word IDs, which the alignment stage uses to attach precise bounding boxes.

### Module map

| Module | Responsibility |
|---|---|
| `pipeline/config.py` | Paths, LLM provider/models, section map, filename parsing |
| `pipeline/preprocess.py` | Image loading, RGB conversion, optional upscale below `MIN_OCR_WIDTH` |
| `pipeline/ocr.py` | Surya OCR → `OcrPage`; per-page cache; **column-reorder + word-bbox repair** on both fresh OCR and cache loads |
| `pipeline/ocr_worker_reverse.py` | Standalone secondary worker; processes from end → start, sharing the cache |
| `pipeline/llm.py` | LLM client (OpenRouter or Google direct), token usage capture, retry-with-backoff |
| `pipeline/align.py` | Validate & coerce LLM word_ids (handles ints, dicts, nested lists); merge into bboxes |
| `pipeline/alto_export.py` | ALTO 4.x XML emitter (with defensive `_set_attr` for None-tolerance) |
| `pipeline/json_export.py` | Per-page JSON + combined indexes |
| `pipeline/run_pipeline.py` | CLI, orchestration, **two-pass auto-retry** of failed pages (primary then fallback model), end-of-run cost summary + sanity check, `--preflight` |
| `pipeline/prompts/*.txt` | One LLM prompt per section type |

---

## 4. Lessons from the pilot — read before book #2

These all bit us in the pilot. Most are now fixed in code. The list is partly an explainer for why some weird-looking code exists.

### 4.1 Cost was 3–4× the naive estimate
Each page sends a 500–1500-word OCR list and receives JSON for every entry. Average per-page on the pilot: ~10K input tokens, ~20K output tokens — far more than back-of-envelope math suggested. **Always run `--preflight 5` before committing to a full run.**

### 4.2 "Free tier" is misleading
Google AI Studio's gemini-2.5-flash free tier is **20 requests/day per project** as of pilot time. Not enough for any real run. **Use OpenRouter pay-per-token from the start.** Even the OpenRouter route to Google models can hit a shared free-pool cap — switch to BYOK on OpenRouter, or pick a non-Google route, if you see "rate-limited upstream" 429s.

### 4.3 GPT-4o-mini is silently lazy on long structured outputs
We tested it on one page early and got 2 entries back instead of 80. No error, just stopped. **Sanity-check entry counts on a new model before committing.** `google/gemini-2.5-flash-lite` was thorough; that's the current default.

### 4.4 The 65K output cap will bite on dense pages
Some occupation/street-register pages emit JSON that hits gemini-2.5-flash-lite's 64K output token limit. The `OPENROUTER_FALLBACK_MODEL` (default `google/gemini-2.5-flash`) handles them in the auto-retry pass at end-of-run. The pilot's last surviving failure (1 dense institutional page) was rescued this way.

### 4.5 LLM word_ids come in inconsistent shapes
Different prompts produce `word_ids` as different things:
- `["w_0001", "w_0002"]` — canonical
- `[1, 2, 3]` — bare integers (advertisement.txt prompt sometimes)
- `[{"id": "w_0001", "text": "Berg"}]` — dicts (institutional prompt sometimes)
- `[["w_0001", "w_0002"], ["w_0003"]]` — nested when free-form-prompted

`align._coerce_word_ids` flattens all of these. `align.align_entry` writes the normalized form back to the entry in place, so downstream code (alto_export, json_export) sees clean strings. **Don't bypass this** — it's defense-in-depth against future prompt variations.

### 4.6 Surya quirks
- **Two-column zigzag**: Surya's default reading order interleaves left and right columns line by line. `ocr._reorder_columns` detects a column gutter from line x-centers and re-emits all-left-then-all-right. Word IDs are renumbered to stay sequential.
- **All-words-share-line-bbox**: Surya occasionally gives every word on a line the same bbox. `ocr._repair_word_bboxes` detects this and redistributes proportionally by character count.
- **JPEG DPI metadata is lying**: most scans report 72 DPI regardless of actual content density. The pipeline ignores DPI metadata entirely — it uses `MIN_OCR_WIDTH` as a pixel-width heuristic and only upscales tiny images.

### 4.7 The architectural debt that nearly cost a day's work
The original pipeline buffered all LLM responses in memory and only wrote per-page JSON during alignment+export at the very end. The export step crashed on a malformed response, taking 836 buffered LLM calls down with it ($8.75 of API costs lost). **Now fixed**: every LLM response is written to `output/llm_raw/` immediately after parsing, and alignment+export writes per-page outputs incrementally. Combined indexes rebuild from disk so even a partial run produces valid indexes for the pages that finished.

---

## 5. Cosmetic gaps still open

Both small, neither blocks using the data:

- **`address_full` is sometimes just the number.** When `address_street` is missing, `align_entry` produces `address_full` like `"29b 29b"` (number duplicated). 5-line fix in `align.py`'s address_full assembly.
- **218 cross-references is suspiciously low** for a book that should have hundreds of `"Zie adv. blz. N"` references. Worth a diagnostic pass over what the `cross_references` field captures — possibly a prompt-side issue.

---

## 6. Architectural debt for v2

`CLAUDE.md`'s "Pilot constraints / fix for v2" section has the full list. The high-priority items for the next book:

1. **Pipeline OCR → LLM** instead of running them as fully sequential stages. As each OCR page completes, queue it for an async LLM worker. Wall time becomes `max(OCR, LLM)` instead of `OCR + LLM`. Especially important once OCR moves to GPU and LLM becomes the long pole.
2. **Streaming combined indexes.** Currently rebuilt at end of run. For a long run, a UI can't query the search index until then. Watch the `output/json/` directory and update indexes incrementally.
3. **Pre-OCR section detection.** The `SECTION_MAP` is hand-configured per book. The LLM can read printed page numbers from headers/footers — make this automatic on first pass.
4. **Structured `output/failures.json`.** Right now failures only land in the log file. A structured sidecar with per-page error class, scan path, and partial response would simplify recovery.
5. **A real OCR worker pool** instead of the reverse-worker hack. Or just run on GPU.

---

## 7. Useful commands

```powershell
# Full run (with everything we learned)
python pipeline/run_pipeline.py

# Estimate cost before committing
python pipeline/run_pipeline.py --preflight 5

# Test pass on a small slice
python pipeline/run_pipeline.py --pages 150-152 -v

# Force-redo everything (ignores all caches)
python pipeline/run_pipeline.py --reprocess

# OCR only, skip LLM (useful while iterating on prompts)
python pipeline/run_pipeline.py --ocr-only

# Second OCR worker for parallel speedup
python pipeline/ocr_worker_reverse.py
```

To re-build only the combined indexes without redoing per-page work:

```powershell
python -c "from pipeline.run_pipeline import _load_all_aligned_from_disk; from pipeline.json_export import build_combined_indexes; build_combined_indexes(_load_all_aligned_from_disk())"
```

---

## 8. Local overlay viewer

A lightweight browser-based viewer lets you inspect the extracted data on top of the scans without needing a website.

**Start it:**

```powershell
python viewer.py
```

This generates `viewer/manifest.json` (list of all processed pages + the index of the first page that has real entries), starts an HTTP server on port 8765, and opens the browser automatically.

**What it shows:**

- The scan image fills the left panel; all extracted entries are drawn as semi-transparent blue boxes on top
- Hovering an entry (on the image or in the sidebar list) shows a tooltip and highlights the name box (green) and address box (orange) separately
- Clicking an entry selects it in the sidebar and shows full field details (name, occupation, address, phone, cross-references) in the bottom panel
- Arrow keys or the ◀▶ buttons navigate between pages
- Starts on the first name-register page (scan 0121); use the dropdown to jump anywhere

**Files:**

| File | Purpose |
|---|---|
| `viewer.py` | Generates manifest, starts server, opens browser |
| `viewer/index.html` | Self-contained HTML/JS viewer (no build step) |
| `viewer/manifest.json` | Auto-generated list of stems + `start_index`; committed files should be treated as build artifacts |

The viewer reads directly from `scans/` and `output/json/` — no pre-processing needed. It is purely a local QA/inspection tool; the actual public website is a separate project (see `ui.md` for the design spec and `website_plan.md` for the roadmap).

---

## 9. Where to look first

- **Architecture & gotchas**: `CLAUDE.md`
- **User-facing setup & usage**: `README.md`
- **What's in the data**: `output/combined/search_index.json` (flat list of all entries) and `output/combined/page_manifest.json` (per-page summary)
- **Section types**: `pipeline/prompts/*.txt`
- **Why a particular page failed**: search `output/logs/pipeline_*.log` for the scan stem; check `output/checkpoint.json` for the failed list

The data is ready for downstream use — a website, a search index, a heritage portal — whatever the next phase calls for.
