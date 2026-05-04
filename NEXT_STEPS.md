# Next Steps — Groningen Adresboek 1926

Consolidated from `handoff.md`, `handoff_crm.md`, `website_plan.md`, `ui.md` on 2026-05-03. Originals moved to `docs/archive/`.

The pilot is **not** "complete" — the working website is the pilot. Pipeline changes remain in scope when website use surfaces data quality issues.

---

## 1. Where we are

**Pipeline run on 1926 Groningen:** 838/838 pages, 60,783 entries, $7.49 LLM cost. Outputs in `output/json/`, `output/alto/`, `output/combined/`. Architecture and gotchas in `CLAUDE.md`. Runbook for next book in `docs/archive/handoff.md`.

**Web app:** not started. No code, no `output/overrides/`. UI design (`ui.md`) and tech detail (`website_plan.md`) survive as references; framing has changed (see §3).

**Known data-quality issues** spotted via `viewer.py`:
- LLM text errors (~5% of entries, varies by section)
- ~~Wildly wrong bboxes on some entries~~ — root-caused 2026-05-03 to a Surya word-cluster bug. Fix landed in `pipeline/ocr.py:_repair_word_bboxes`. Existing JSONs need a re-run to pick up the corrected coords. See §11.
- `address_full` duplicates the number when street is missing (`"29b 29b"`)
- Only 218 cross-references — suspiciously low; likely prompt-side miss

These are why the CRM exists. We fix them in human-in-the-loop overrides, not by re-running the pipeline.

---

## 2. Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | **Single Next.js app.** Public site + admin CRM share routes. `/admin/*` gated by basic-auth middleware. | Most "CRM UI" is foundation the public site needs anyway. |
| 2 | **Single user.** Env-var password, no roles, no conflict handling. | Only the project owner edits. |
| 3 | **Bbox edits propagate to ALTO.** Admin draws entry-level rect; words redistributed proportionally inside it (reuse the algorithm in `pipeline/ocr.py`). | ALTO is for archival display, not OCR ground truth. |
| 4 | **Per-entry single rectangle** in admin, not per-word. | Word-level UI = far more work; public site only displays entry-level highlights. |
| 5 | **Overrides live in `output/overrides/<stem>.json`**, merged at read time. | Generated `output/json/` and `output/alto/` stay reproducible from pipeline. |
| 6 | **Stack:** Next.js 15 (App Router) + TS, Tailwind, react-konva (admin canvas), OpenSeadragon (public deep-zoom), SQLite + FTS5 (search), MapLibre GL + COG (map). | See `docs/archive/website_plan.md` for the SQLite schema and Fly.io deploy detail. |
| 7 | **Konva on plain `<img>` for admin canvas.** Skip DZI for admin. | Konva is purpose-built for draggable shapes; OSD's overlay layer fights you. Plain JPEG is ~3 MB/page, fine for admin flow. If glyph-level zoom needed, "open in public viewer" button. |
| 8 | **Same repo, `web/` subdir.** | Overrides live next to the pipeline that produces what they override; one git history. |
| 9 | **SQLite as a build step.** Admin reads JSON+overrides at request time. `npm run build:db` regenerates SQLite from JSON+overrides for public deploy. | Simpler edit loop; fast public reads; no write amplification on save. |

---

## 3. Stable entry IDs (prerequisite — must do before any override write)

Without this, every pipeline rerun orphans corrections.

- **Primary key:** `<stem>:<entry_index>` e.g. `0003_000138_0156:14`
- **Sidecar fingerprint:** `sha1(normalized_name + normalized_address + normalized_occupation)` stored in each override
- **Reconciliation pass on rerun:**
  - fingerprint matches entry at same index → keep
  - fingerprint matches entry at different index on same page → migrate
  - no match anywhere on page → flag `orphaned`, surface in admin for manual review (don't silently drop)

Implement in `pipeline/reconcile_overrides.py`. ~1 day.

---

## 4. Override schema

`output/overrides/<stem>.json` — atomic writes (`.tmp` then rename).

```jsonc
{
  "<stem>:<entry_index>": {
    "fields": {            // partial, only changed fields, same shape as output/json entry
      "name": "...",
      "address_full": "...",
      "occupation_expanded": "..."
    },
    "bbox": {
      "type": "rect",
      "value": [x1, y1, x2, y2],
      "source": "manual"
    },
    "flags": {
      "verified": true,
      "needs_review": false,
      "bbox_unreliable": false  // suppresses highlight overlay
    },
    "fingerprint": "sha1:abc123...",
    "edited_at": "2026-05-02T14:23:01Z",
    "edit_history": [{ "ts": "...", "diff": { /* ... */ } }]
  }
}
```

Merge at read time: shallow-merge `fields`, replace `bbox`, redistribute word bboxes inside new rect for ALTO.

---

## 5. Build plan

### Foundation slice (week 1, ~5 days) — ship-or-bail gate

End-of-week target: a strict upgrade over `viewer.py` running as a deployable Next.js app, read-only.

- Next.js 15 + TS + Tailwind scaffold in `web/`
- Public route `app/[locale]/page/[stem]/page.tsx` — scan + bbox overlay + entry list
- One section template (start with name register — densest, biggest win)
- Reads `output/json/` directly (no DB yet)

### Vertical edit slice (week 2, ~3 days) — commit-or-reconsider gate

If editing ergonomics feel right after this, full plan is on. If Konva fights you or the workflow is awkward, reconsider before sinking another 10 days.

- Stable entry IDs + reconciliation script
- Basic-auth middleware on `/admin/*`
- Konva canvas: select one rectangle, drag, resize
- `PATCH /api/admin/page/[stem]/entry/[id]` → atomic write to `output/overrides/`
- Reload reflects change

### Forms + canvas polish (week 3, ~7 days)

- Per-section forms × 5 (name, street, occupation, institutional, generic)
- Dirty state, save flow, undo
- Zoom/pan in canvas, draw-new-rect, keyboard nudge
- Remaining 4 section templates

### Workflow + integration (week 4, ~3 days)

- Filters (verified / flagged / unreviewed)
- Mark-page-verified, keyboard shortcuts
- ALTO write-back wiring (overrides → `pipeline/alto_export.py`)
- `npm run build:db` (JSON + overrides → SQLite + FTS5)
- Combined-index regen
- Stats dashboard: % verified, error rate per section

**Total ~18 focused days, ~4 weeks calendar at relaxed pace.**

### Scrappy MVP fallback (~7–8 days)

Text edit + draw-one-rect, no zoom, no undo, one generic form, no reconciliation. Ship if uncertain about full plan.

---

## 6. Public site (after CRM core works, weeks 5+)

These come from `docs/archive/website_plan.md` and stay valid:

- DZI tile generation: `vips dzsave` over 838 scans → ~2 GB tiles (one-time, ~10 min)
- PDOK Locatieserver geocoding pass (~80% hit rate expected, batch script)
- Historic-map COG conversion (`gdal_translate -of COG`)
- MapLibre GL view: markers + clustering + COG overlay + opacity slider
- OpenSeadragon viewer with SVG overlay highlights
- Bidirectional nav: search ↔ map ↔ scan
- next-intl for NL/EN
- Fly.io deploy (~$4/mo for shared-cpu-1x + 5 GB volume)

UI/UX design: see `docs/archive/ui.md`. Map-centric layout with collapsible search and scan panels.

---

## 7. Pipeline work — moved to `docs/pipeline-v2.md`

Pipeline backlog and the v2 architecture (Loghi/HTR support, DGX Spark target, local LLM, Linux-first design) live in `docs/pipeline-v2.md`. This file (`NEXT_STEPS.md`) is now scoped to the **web app + CRM** workstream only.

Already-fixed pilot lessons still live in `docs/archive/handoff.md` §4 — read before book #2 if running the existing pilot pipeline on a new book without v2.

---

## 8. Things NOT to do without re-discussing

- Don't mutate `output/json/`, `output/alto/`, `output/llm_raw/` — those are reproducible; corrections go in `output/overrides/`
- Don't switch stack (SvelteKit, raw `<canvas>`, etc.) — Next + Konva + Tailwind is locked
- Don't add multi-user auth, OAuth, or a DB for the editing layer
- Don't try per-word bbox editing in admin
- Don't deploy admin publicly on Fly. Local-only or VPN/IP allowlist. Only public read-only site goes to Fly.

---

## 9. Open / deferred

- **Geocoding failure mode.** PDOK is expected ~80%. The other ~20% (Groningen 1926 streets that no longer exist or were renamed) needs a concordance file. Defer until website actually shows the empty markers.
- **DZI build pipeline location.** `vips dzsave` runs once. Where does it live — repo script, GitHub Action, or local-only? Decide when starting public-site work.
- **Public semantic filters (Namen / Straten / Beroepen).** Original SearchPanel had `Alle / Namen / Straten / Beroepen` filter buttons (visual only, never wired). Round 2 §4 (2026-05-03) repurposed those buttons for admin-only status filtering (`Alle / Goed / Twijfel / Open`); public route now has no filter row. If public users want to constrain results to a field, restore the semantic filter as a separate row. Type-narrowing logic is trivial (`entry.name` / `entry.address_street` / `entry.occupation` truthy). Backend query already searches all fields via `searchable_text`. Low priority — text query already covers most needs.

---

## 10. Reference

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Architecture, gotchas, conventions |
| `README.md` | User-facing setup & usage |
| `docs/archive/handoff.md` | Pilot results + book-#2 runbook (PowerShell-centric) |
| `docs/archive/handoff_crm.md` | Original CRM planning conversation (superseded by this doc) |
| `docs/archive/website_plan.md` | Public-site tech detail (SQLite schema, Fly.io, COG, PDOK) — still valid |
| `docs/archive/ui.md` | UI/UX design with layout and palette |
| `viewer.py`, `viewer/index.html` | Local QA viewer (to be superseded by `web/` foundation slice) |

---

## 11. Bbox cluster bug — root cause, fix, and how to spot it again

### What was wrong

Across the dataset, entry/name bboxes were systematically shifted right of the visible text. On name-register pages the surname fell entirely outside its own entry's bbox; on advertisement pages the leftmost ~150–400 px of every ad row was uncovered. The shift was real, not a typography or renderer issue — verified by drawing JSON `entry_bbox` directly onto the source JPEG and seeing the surname/ad title sit clearly to the left of the box.

### Root cause

Surya's per-line bbox (`OcrLine.bbox`) is correct end-to-end on this dataset, but its **per-word bboxes** sometimes collapse: most words on a row get one shared "cluster" bbox that covers only a sub-range of the line, and one trailing word (typically a house-number or `Tel. NNNN`) gets its own wider bbox extending to the line's right edge. The cluster's left edge sits well inside the line, so any union of word bboxes (entry, name, address) starts mid-line and misses the leftmost characters.

The defensive `_repair_word_bboxes` pass in `pipeline/ocr.py` was supposed to redistribute clustered words by character count, but had two flaws:

1. **Detection threshold too lax.** The old check skipped repair when ≥30 % of word bboxes were distinct after rounding. The trailing-word-with-different-bbox pattern produces ~30–50 % distinctness for a typical 5–8-word line, so most lines slipped past the threshold.
2. **Wrong span for redistribution.** Even when repair fired, it spread words across the *word cluster's* enclosing bbox (the wrong, sub-line range), not the *line bbox* (the correct full-line range). So repaired words still missed the leftmost portion of the row.

### The fix (landed 2026-05-03)

In `pipeline/ocr.py:_repair_word_bboxes`:

- **Detection** is now "majority share a cluster": count words whose rounded bbox matches at least one other word; if those words are more than half the line, the line is degenerate and we repair.
- **Redistribution** spans `OcrLine.bbox` (Surya's correct line bounds), with y-range from the words themselves (line bbox y is often loose). Words are placed by character-count proportion across `[lx1, lx2]`.
- **Idempotent**: after a clean repair, words have distinct bboxes and the detection no longer triggers, so re-running over already-repaired data is a no-op.

`_load_cache` applies the repair on every cache read, so existing OCR caches benefit on the next pipeline run without re-OCR.

### How to refresh existing outputs

Surya OCR caches in `output/hocr/` still hold the original clustered word bboxes — the repair runs in-memory at load time. To refresh `output/json/`, `output/alto/`, and `output/combined/` with corrected bboxes:

```powershell
python pipeline/run_pipeline.py
```

This re-loads each cache, applies the new repair, re-aligns (using `output/llm_raw/` so no LLM cost), and re-exports per-page JSON + ALTO. Combined indexes rebuild from disk at the end. No `--reprocess` and no Surya re-run needed.

### How to spot a similar issue in future books

Bbox-vs-image misalignment is hard to see in the web UI when the misalignment is uniform across a page (you don't have a reference for "where it should be"). Two cheap diagnostics to keep in mind:

1. **Rendered-overlay debug script** (`~/Documents/claude-output/bbox_debug.py`): given a stem, reads `output/json/<stem>.json` and draws every `entry_bbox` + `name_bbox` + first-name-word bbox directly onto the JPEG in `scans/<stem>.jpg`. If a bbox doesn't visually wrap its name on the JPEG, the data is wrong, not the renderer. Reproducible from disk; doesn't need the web app running.
2. **Line-vs-word-cluster comparison.** For any suspect line, dump `OcrLine.bbox` (line-level) and the `bbox` of each `OcrWord` on it. If line span is e.g. `[169, 822, 1682, 903]` but every word sits at `[545, 842, 1305, 882]`, that is the cluster bug — repair should be triggering. If `_repair_word_bboxes` *isn't* firing on a clearly-clustered line, its detection is too conservative for the new dataset.

The relevant invariant when looking at OCR output:
> The min `OcrWord.bbox[0]` on a line should equal `OcrLine.bbox[0]` (give or take a few pixels). If the leftmost word starts well inside the line bbox, something has clipped the words.

### What this teaches us for v2

The pipeline already has `OcrLine.bbox` available and **correct**, but the alignment stage builds entry bboxes purely from word bboxes via `merge_bboxes`. That works only when word bboxes are trustworthy. Two structural improvements worth keeping in mind for `pipeline-v2.md`:

- **Use `OcrLine.bbox` as a sanity ceiling/floor for entry bboxes.** When merging word bboxes for an entry, clip to the union of the lines those words live on. That neutralizes future per-word bbox quirks from any OCR engine, not just Surya.
- **Cross-check OCR engines on this failure mode.** If swapping Surya for Loghi/HTR or another engine, dump line vs. word-cluster bboxes for one full page and confirm the leftmost word starts at the leftmost line bbox before trusting the rest of the run.

### Earlier hints we missed

- `CLAUDE.md` "Pilot constraints / fix for v2" item #11 documented this exact failure mode ("Surya occasionally emits the same bbox for every word on a line") and claimed it was fixed. The fix existed but its detection threshold was wrong, so the bug stayed silent in the data.
- The 2026-05-03 admin-CRM screenshots showed bboxes clearly starting after the surname. The "typography indentation" hand-wave was wrong; trust the user's eyes.
