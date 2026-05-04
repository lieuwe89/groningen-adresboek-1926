# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Python pipeline that extracts structured data from ~900 scanned pages of the 1926 Groningen (Netherlands) address book. **This is a pilot** — first of several address books; architecture decisions captured in "Pilot constraints / fix for v2" below.

It combines **Surya OCR** (transformer-based, word/line bboxes) with a **vision LLM via OpenRouter** (Gemini 2.5 Flash Lite by default), then exports ALTO XML and JSON.

## Setup requirements

- Python 3.10+
- `pipeline/config_local.py` with `OPENROUTER_API_KEY = "sk-or-v1-..."` (or `GOOGLE_AI_API_KEY` if using Google direct)

```powershell
pip install -r requirements.txt
```

Surya models download on first run (~100 MB) into `%LOCALAPPDATA%\datalab`. `transformers<5` is required and pinned.

## Running the pipeline

```powershell
python pipeline/run_pipeline.py --test 3 -v       # Test with 3 pages, verbose
python pipeline/run_pipeline.py --pages 50-60     # Specific page range
python pipeline/run_pipeline.py --ocr-only        # OCR only, skip LLM stage
python pipeline/run_pipeline.py --reprocess       # Ignore checkpoints, redo all
python pipeline/run_pipeline.py                   # Full run (~30h CPU, ~$2-3 LLM)
```

For long runs, launch detached so it survives shell exits — see "Long unattended runs" in README.md. A second worker (`pipeline/ocr_worker_reverse.py`) doubles OCR throughput by sharing the per-page cache.

## Architecture

The pipeline runs in 5 sequential stages:

```
JPEG scans → [1] discover → [1.5] layout analysis
          → [2] Tesseract OCR (hOCR, word bounding boxes)
          → [3] Gemini LLM (correction, structuring, word ID references)
          → [4] Alignment (link Gemini entries → Tesseract bounding boxes)
          → [5] Export (ALTO XML + JSON per page + combined indexes)
```

Key insight: Gemini receives both the scan image AND a numbered word list from Tesseract. It returns structured entries that reference Tesseract word IDs, which the alignment stage uses to attach precise bounding boxes.

### Module responsibilities

| Module | Responsibility |
|---|---|
| `pipeline/config.py` | All settings: paths, LLM provider, section mapping, filename parsing (format: `archiveNumber_recordNumber-year_scanNumber.jpg`, e.g. `1769_19525-1926_0001.jpg`) |
| `pipeline/preprocess.py` | Image loading, RGB conversion, optional upscale if image is below `MIN_OCR_WIDTH` |
| `pipeline/ocr.py` | Surya OCR → `OcrPage` with word/line bboxes; per-page disk cache at `output/hocr/<stem>.ocr.json` |
| `pipeline/ocr_worker_reverse.py` | Standalone secondary worker; processes pages from end → start, sharing the cache with `run_pipeline.py` |
| `pipeline/llm.py` | LLM client (OpenRouter or Google direct), rate limiting, JSON-fence parsing, retry with backoff |
| `pipeline/align.py` | Validate LLM word ID references and merge into bboxes from `OcrPage` |
| `pipeline/alto_export.py` | ALTO 4.x XML generation |
| `pipeline/json_export.py` | Per-page JSON + combined search/address/street indexes |
| `pipeline/run_pipeline.py` | CLI entry point, orchestrates all stages |
| `pipeline/prompts/*.txt` | One LLM prompt per section type |

### Output locations

| Output | Path |
|---|---|
| Raw hOCR | `output/hocr/` |
| ALTO XML | `output/alto/` |
| Per-page JSON | `output/json/` |
| Combined indexes | `output/combined/` (search, address, street) |
| Logs | `output/logs/` |
| Checkpoint | `output/checkpoint.json` |

## Configuration

Edit `pipeline/config.py` or override in `pipeline/config_local.py` (takes precedence):

- `SCAN_TO_PAGE_OFFSET` — scan number minus printed page number (default: 2)
- `SECTION_MAP` — maps printed page ranges to section types and prompt files
- `GEMINI_REQUESTS_PER_MINUTE` — rate limiting (default: 10, free tier limit: 15)
- `TESSERACT_PSM` — page segmentation mode (default: 1; try 3 for two-column issues)

## Section types and book structure

| Section | Printed pages | Prompt file |
|---|---|---|
| Front matter | 1–8 | `generic.txt` |
| Institutional listings | 9–118 | `institutional.txt` |
| Name register (main data) | 119–603 | `name_register.txt` |
| Street register | 604–799 | `street_register.txt` |
| Occupation register | 800+ | `occupation_register.txt` |

The name register (pages 119–603) is two-column and the densest section. Scan numbers ≠ printed page numbers due to cover scans (offset of 2).

## Checkpointing and resumability

`output/checkpoint.json` tracks completed and failed pages. Re-running the pipeline skips already-completed pages. Use `--reprocess` to ignore the checkpoint. Check `checkpoint["failed"]` for pages that need attention.

## Pilot constraints / fix for v2

This pipeline is the pilot for a planned series of address-book extractions.
The current shape is "stages run sequentially across all pages" because that
was simplest. For multi-book production, the following are known weaknesses
worth re-architecting before the next run:

1. ~~**LLM results buffered in memory until export.**~~ **FIXED** during
   pilot after this exact bug bit us at the end of the first full run:
   the process died at the start of the export stage and 829 pages of
   buffered Gemini results were lost (cost: $8.75 on the rerun). Now
   `stage_gemini` writes each page's raw response to
   `output/llm_raw/<stem>.json` atomically right after the call, and the
   resume logic prefers that file over re-calling the LLM. The export
   stage also writes per-page JSON+ALTO immediately, and rebuilds combined
   indexes from disk (so they're correct even on a partial run).

2. ~~**No streaming partial outputs.**~~ **PARTIALLY FIXED.** Per-page
   `output/json/<stem>.json` and `output/alto/<stem>.xml` are now written
   immediately after each page is aligned, so a UI can stream them. Combined
   indexes are still only rebuilt at the end of a run, but they now build
   from on-disk JSONs (so even a partial run produces correct indexes for
   the pages that finished). Truly continuous incremental indexing is still
   v2 work — for now, just rerun to refresh combined indexes.

3. ~~**Stages are page-batched, not pipelined.**~~ **FIXED.**
   `stage_ocr_llm_pipelined` in `pipeline/run_pipeline.py` runs OCR on the
   main thread (producer) and LLM on a single worker thread (consumer)
   linked by a bounded `queue.Queue`. As each OCR page completes it's
   handed straight to the LLM, so wall time is `max(OCR, LLM)` instead of
   `OCR + LLM`. The single LLM worker preserves the existing rate-limit
   semantics; a multi-worker pool with a shared rate limiter is deferred
   until LLM becomes the long pole on GPU OCR. `--ocr-only` still uses the
   sequential `stage_ocr` for clarity.

4. **OCR is single-process; speedup via a sibling worker is a hack.**
   `pipeline/ocr_worker_reverse.py` is a workaround that runs a second
   process from the back of the list to use the remaining cores. **Fix:**
   either a proper multi-worker OCR pool with a shared queue, or just run
   on GPU where one process saturates the device.

5. **Image DPI metadata can't be trusted.** Most JPEG scans report 72 DPI
   regardless of actual content. The original code naively upscaled 4× to
   "reach 300 DPI", costing 5× compute for no quality gain. Current code
   uses `MIN_OCR_WIDTH` as a pixel-width heuristic. **Fix for v2:** make
   the pixel-width target explicit per archive, and ignore DPI metadata
   entirely.

6. **Section detection relies on hard-coded page ranges.** `SECTION_MAP`
   and `SCAN_TO_PAGE_OFFSET` are configured manually per book. **Fix:**
   detect sections from the printed page number on each scan (LLM can
   read the header/footer) or from a brief setup pass.

7. ~~**Failed pages aren't auto-retried at end-of-run.**~~ **FIXED.**
   `stage_gemini` now ends with a two-pass retry: (1) same model with
   exponential backoff, (2) for whatever still fails, switch to
   `OPENROUTER_FALLBACK_MODEL` (default `google/gemini-2.5-flash`, full —
   not Lite). The pilot's last surviving failure (a single dense
   institutional page that hit the 65K output cap) was rescued by the
   fallback model.

8. ~~**No per-page cost telemetry.**~~ **FIXED.** Each LLM call writes
   `output/llm_usage/<stem>.json` with `prompt_tokens`, `completion_tokens`,
   and the model name. End-of-run cost summary aggregates these against a
   small price table (`LLM_PRICING_USD_PER_M` in `run_pipeline.py`).
   Use `python pipeline/run_pipeline.py --preflight 5` to project full-book
   cost from a sample before committing.

9. ~~**No structured error output.**~~ **FIXED.** When all retries fail,
   `process_page_with_gemini` writes a per-page record to
   `output/failures/<stem>.json` (error class, message, attempts, model,
   partial response excerpt). On a subsequent successful re-run the file
   is cleared. The end of `stage_gemini` / `stage_ocr_llm_pipelined`
   aggregates surviving sidecars into `output/failures.json` (counts by
   error class and section), or removes the aggregate when nothing failed.

10. ~~**Surya emits zigzag reading order on two-column pages**~~ **FIXED.**
    `pipeline/ocr.py` detects a column gutter from line x-centers and
    reorders lines as full-left then full-right. Word IDs are renumbered
    to stay sequential. Applied in both `run_ocr` and `_load_cache`, so
    existing cached pages benefit on the next read.

11. ~~**Surya occasionally emits the same bbox for every word on a line.**~~
    **FIXED.** A defensive repair pass in `pipeline/ocr.py` detects
    rounded-equal word bboxes and redistributes them proportionally by
    character count.

These are deferred for the pilot — the cost of redoing a partial run is
small enough (~$1.50 + a few hours of wall time) that the simple
architecture wins. Revisit before book #2.

## Speeding up the OCR pass

Surya CPU runs at ~2 minutes/page on a Ryzen 5 7500F (6c/12t), so a full
book is ~24–30 hours. Two things are worth knowing:

- **CPU utilization in Task Manager looks like 50% — that's a lie.** PyTorch
  defaults to one thread per *physical* core (6 here), not per logical thread.
  Hyperthreading rarely helps matmul (the threads fight for the same execution
  ports), so this is the right setting. Task Manager averages over 12 logical
  cores → 6 saturated cores show as 50%. You're already at 100% of useful
  compute.
- **For real speedup, run a second worker in parallel.** `pipeline/ocr_worker_reverse.py`
  iterates from the back of the scan list while the main pipeline goes from
  the front. Both share `output/hocr/<stem>.ocr.json` as a cache and skip
  pages the other has finished. Net throughput goes up ~1.6–1.8× (memory
  bandwidth becomes the next bottleneck, not core count). Cost: ~3 GB extra
  RAM for the second Surya model load.

Launch the reverse worker as a detached process so it survives shell exits:

```powershell
Start-Process -FilePath python -ArgumentList "-u","pipeline\ocr_worker_reverse.py" `
  -WorkingDirectory <repo> -WindowStyle Hidden `
  -RedirectStandardOutput <out>.log -RedirectStandardError <out>.err
```

Same trick for the main pipeline — `Start-Process -WindowStyle Hidden`
detaches it from the parent shell, so closing a terminal (or a Claude Code
session) doesn't take it down with it. Long runs launched as a foreground
child of the shell tend to die silently when the parent exits.

Also: **disable Windows sleep** before a long unattended run. Detachment
survives shell exit, not OS suspend.

## Common issues

| Issue | Fix |
|---|---|
| LLM returns invalid JSON | Edit prompts in `pipeline/prompts/`, add stricter output instructions; `llm._extract_json_from_response` already strips markdown fences |
| LLM truncates output mid-JSON on dense pages | Raise `max_tokens` in `pipeline/llm.py` (currently 65536) |
| OpenRouter 429 / "rate-limited upstream" | The shared free pool for Google models can hit limits — switch `OPENROUTER_MODEL` to a non-Google route or add your own Google AI key as BYOK on OpenRouter |
| GPT-4o-mini extracts only a few entries per page | Known laziness on long structured outputs — use `google/gemini-2.5-flash-lite` instead, which is also cheaper |
| Word ID mismatches | `align.py` has fuzzy matching fallbacks; investigate there |
| Rate limit errors | Pipeline auto-retries with backoff; lower `GEMINI_REQUESTS_PER_MINUTE` |
| Wrong section type | Adjust `SCAN_TO_PAGE_OFFSET` in config |
| Pipeline dies silently overnight | Likely the parent shell exited or Windows slept — relaunch with `Start-Process -WindowStyle Hidden` and disable sleep |
