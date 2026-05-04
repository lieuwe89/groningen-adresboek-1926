# Handoff — 2026-05-04 (Slice C UI: book-wide search + section jump)

This session wired the public-site UI to the data layer that Slice B+C
foundation set up: `SearchPanel` now calls `/api/search` for book-wide
results, and a section-jump dropdown in the header navigates between
the printed book's six sections.

Pushed to `origin/main`. Web app version bumped 0.1.0 → 0.2.0.

## TL;DR — where to resume

```bash
git pull
cd web && npm install
npm run build:db                # regenerates web/data/adresboek.sqlite (gitignored)
npm run dev                     # http://localhost:3001
```

In the running app:

- Type into the search box (left rail) — when you have ≥ 2 chars, the
  rail switches to "BOEKZOEKEN" and shows hits across the whole book
  with page numbers. Click a hit to navigate.
- Header has a "Sectie" dropdown — pick e.g. "Stratenregister" to jump
  to the first scan of that section.

Then continue with one of the **next-step options** at the bottom. The
most natural next move is **Slice F (MapLibre + markers)** — the data
is ready and the UI rails around it are stable.

## Repo

- **GitHub:** https://github.com/lieuwe89/groningen-adresboek-1926 (private)
- **`origin/main` HEAD:** `a0f1210` "chore(web): bump version to 0.2.0"
- **Local clone:** `/Users/lieuwejongsma/projects/groningen-adresboek-1926`
- **Working tree:** clean except for in-progress pipeline-engine work
  on `pipeline/align.py`, `pipeline/json_export.py`, `pipeline/llm.py`,
  `pipeline/ocr.py` and untracked `pipeline/ocr/`,
  `pipeline/prompts/classify_section.txt` — separate work-in-progress
  from the OCR-engine-abstraction branch (commits `1e6220b` and
  `5802e0c`). Not touched in this session.

## What landed this session

### 1. Wired SearchPanel to `/api/search` (Slice C UI) — commit `0402130`

`web/components/SearchPanel.tsx` gained a global mode. When the search
input has ≥ 2 trimmed characters, `Viewer.tsx` debounces a fetch to
`/api/search` (220 ms, abortable, request-sequence guard against
out-of-order responses) and passes results to a new `GlobalResults`
subcomponent. Empty input falls back to the original page-local entry
list.

Hits show name + occupation + address + page number. Click navigates
to `/page/<stem>?entry=<stable_id>&q=<query>`. On the destination page,
`Viewer.tsx` reads `?entry` and `?q` once on stem change, restoring
the query in the input and selecting the linked entry.

New shared client type: `web/lib/searchTypes.ts` (mirrors `SearchRow`
in `lib/db.ts` so the better-sqlite3 import doesn't leak into the
client bundle).

**Defensive fix bundled in same commit:** `web/lib/overrides.ts:111`
now uses `page.entries ?? []` — 353 of 838 per-page JSONs have
`entries: null` (street/occupation/front-matter sections store entries
under `streets[]`/`occupations[]`/etc.), and `mergeOverrides.map` was
throwing → `loadPage` returned null → 404 for the entire section.
Patch makes those pages render the scan with an empty entry list. The
deeper schema mismatch is logged for later (see "Known caveats").

### 2. Section-jump dropdown — commit `7e384dc`

`GET /api/sections` (new route) returns the six sections of the 1926
book with their first stem, first printed page number, count, and a
Dutch label:

| section_id | label | first_stem | count |
|---|---|---|---|
| `other` | Voorwerk | 1769_19525-1926_0001 | 10 |
| `institutional` | Instellingen | 1769_19525-1926_0011 | 104 |
| `advertisement` | Advertenties | 1769_19525-1926_0025 | 6 |
| `name_register` | Naamregister | 1769_19525-1926_0121 | 485 |
| `street_register` | Stratenregister | 1769_19525-1926_0606 | 196 |
| `occupation_register` | Beroepenregister | 1769_19525-1926_0802 | 37 |

`web/components/SectionJump.tsx` is a client component that fetches
once on mount and renders a `<select>` with `Sectie — blz N (count)`
options. The current section is auto-detected from the active stem
(highest `first_stem <= currentStem`). Replaces the static
`<Meta label="Sectie" value="Naamregister" />` in `Header.tsx`.

Same commit appended `NEXT_STEPS.md §12` — postmortem on the per-page
JSON / DB index mismatch.

### 3. Version bump — commit `a0f1210`

`web/package.json` 0.1.0 → 0.2.0 (per repo convention: bump before
push). No git tag — this repo doesn't have a tagging convention yet.
First time we'd want one is probably when ROADMAP slice F or G ships,
since that's the first deploy-able milestone.

## Known caveats (still open)

### Per-page JSON / DB stable_id mismatch (deferred)

`scripts/build_db.py` indexes street/occupation/institutional sections
via `pipeline.json_export._collect_entries_for_index`, which pulls
from `streets[].properties[]` etc. So FTS hits resolve correctly to
the right `stem` and assign a `stable_id` of `<stem>:<index>`. But the
front-end loader `web/lib/data.ts:loadPage` only reads
`page.entries`, which is `null` for those sections, so when you click
a global-search hit on a street, the destination page renders the scan
fine but has no entry list, no left-rail highlight, no bbox overlay.

This is fully documented in `NEXT_STEPS.md §12`. Two structural fixes
laid out there:

- (A) Have both `loadPage` *and* `build_db.py` run a shared flattener
  that collapses section sub-arrays into a uniform `entries[]` in the
  same order. Pure code change; no schema or data migration. Probably
  the right move.
- (B) Change the DB schema to store `entry_index_in_page` *and*
  `entry_kind` so the loader can find the right sub-array entry.
  Heavier, but more future-proof if other entry kinds appear.

The public site should not ship without one of these — global search
is one of the headline features and clicking a hit on a street should
land you on the highlighted street row, not a blank stub.

### Section classification noise

`street_register` first stem is `0606` but that scan visually shows an
advertisement page — section labels at section borders are noisy
(see ad pages 0023–0028 misclassified as `advertisement` when they
sit inside the institutional/name-register region by printed page).
Refining `pipeline/config.py:SECTION_MAP` is pipeline-side work and
out of scope for the public-site phase. The dropdown lands on whatever
the DB says.

### Pipeline `preprocess.py` Tesseract leftovers (unchanged from prev handoff)

Still there. `run_pipeline.py` errors on macOS, `refresh_outputs.py`
avoids it. ~30 min cleanup for v2.

## Next-step options (sorted by leverage)

1. **Slice F: MapLibre + markers** (~3–4 h). Replace the blueprint
   placeholder in `web/components/MapPanel.tsx` with a real MapLibre
   map. Plot the 49,959 lat/lng entries with clustering, popups for
   marker clicks. Reads via a new `/api/markers?bounds=…` endpoint or
   serves the full geocoded set as static JSON for v1. Search ←→ map
   linking comes here.

2. **Fix stable_id flatten (caveat above)** (~2 h). Sharing the
   flattener between `build_db.py` and `loadPage` so global-search
   hits on street/occupation pages actually highlight. Worth doing
   before Slice F so map markers can carry the correct entry refs.

3. **Slice G: COG historic overlays** (~2–3 h once #1 is done).
   `gdal_translate -of COG` over the 6 GeoTIFFs (output to
   `web/public/maps/` or a Fly volume), then
   `@geomatico/maplibre-cog-protocol` for runtime tile fetch.
   Layer-switcher UI with opacity slider per layer.

4. **Slice D + E: DZI tiles + OpenSeadragon** (~3 h).
   `brew install vips`, then `vips dzsave` over the 838 scans → ~2 GB
   of WebP tiles in `web/public/tiles/`. Replace plain `<img>` in
   `ScanPanel` with OpenSeadragon. SVG overlay for entry highlighting
   (re-using bboxes already in the search response).

5. **Pipeline backlog** (low priority for public-site work):
   - Clean stale `pipeline/preprocess.py` Tesseract code.
   - LLM prompt iteration for `(B.)`/`E.` mis-reads.
   - Land the engine-abstraction WIP from `pipeline/align.py` etc.

## Key file references (delta this session)

| File | What |
|---|---|
| `web/lib/searchTypes.ts` | Client-shared types for `/api/search` response |
| `web/lib/db.ts` | + `listSections()`, `SectionInfo`, Dutch labels |
| `web/lib/overrides.ts` | Defensive `page.entries ?? []` fix |
| `web/app/api/search/route.ts` | Unchanged from previous handoff |
| `web/app/api/sections/route.ts` | New — GET /api/sections |
| `web/components/SearchPanel.tsx` | + `globalMode` rendering, `GlobalResults` |
| `web/components/SectionJump.tsx` | New client dropdown for header |
| `web/components/Header.tsx` | Replaces static "Sectie" Meta with dropdown |
| `web/app/page/[stem]/Viewer.tsx` | Debounced fetch, nav, URL-param restore |
| `NEXT_STEPS.md` | Appended §12 — Slice C postmortem |
| `web/package.json` | 0.1.0 → 0.2.0 |

Background context still in:

- `HANDOFF_GEOCODE.md` — geocoder run notes (pre-alias version, caveat applies).
- `docs/archive/website_plan.md` — full public-site plan with API shape, deploy details.
- `docs/archive/ui.md` — UI/UX layout, palette, interaction flows.
- `NEXT_STEPS.md` §11 — bbox cluster bug postmortem (still relevant for v2).

## To resume in a fresh Claude session

Open this file. Tell Claude: *"continue from HANDOFF.md"*. Pick one of
the **next-step options**. Strong recommendation: **#2 (stable_id
flatten) before #1 (Slice F)**, because Slice F's map markers will
carry the same `stable_id` references and inherit the same broken
nav-into-empty-page behaviour for non-name-register entries if not
fixed first. Maybe ~2h spent now saves rework in Slice F.
