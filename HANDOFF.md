# Handoff — 2026-05-04 (public-site groundwork)

This session moved Round 3 work from the personal macOS box onto a private
GitHub repo and laid the data layer for the public map-centric explorer.
Everything in this handoff is committed and pushed; nothing is lost on
`/clear`.

## TL;DR — where to resume

```bash
git pull
cd web && npm install
npm run build:db                    # regenerates web/data/adresboek.sqlite
npm run dev                         # http://localhost:3001
curl 'http://localhost:3001/api/search?q=bakker&limit=3'   # smoke
```

Then continue with one of the **next-step options** at the bottom. The most
natural next move is **Slice F (MapLibre + markers)** — the data is ready.

## Repo

- **GitHub:** https://github.com/lieuwe89/groningen-adresboek-1926 (private)
- **`origin/main` HEAD:** `a3234d9` "Slice B + C foundation"
- **Local clone:** `/Users/lieuwejongsma/projects/groningen-adresboek-1926`
- **History:** initial commit `0321de1` is the squashed root (prior 2 commits
  rewritten away to drop >100 MB GeoTIFFs from blob history; see NEXT_STEPS
  §11 for the bbox fix postmortem that lived in those commits).
- **Working tree status:** clean, on `main`, tracking `origin/main`.

## What landed this session

### 1. Bbox refresh (Round 3 follow-up — rewrites output/)

`pipeline/refresh_outputs.py` (new) — re-aligns + re-exports all 838 pages
from cached OCR + cached LLM raw, no network, no GPU. 13.5 s.

Bypasses `pipeline/run_pipeline.py` because that file imports a stale
`pytesseract` / `TARGET_DPI` / `TESSERACT_LANG` Tesseract layout helper
in `pipeline/preprocess.py` that no longer matches `pipeline/config.py`.
Refresh script avoids the broken module path.

Verified post-refresh: `Berg` 0150 entry at x=273; `Bergh` 0151 at x=148;
`Beukema` 0152 at x=248. All match the post-fix expectation in NEXT_STEPS §11.

### 2. PDOK geocoding — done

- `scripts/geocode_addresses.py` — concurrent (20 workers), resumable,
  idempotent. Stdlib only. Synced from a second-PC run that had to add
  street aliases (1926 → current Dutch spelling) plus `compute_flags`
  semantics (`uncertain` / `not_found`).
- `output/geocoded/addresses.json` (~14 MB, on Drive — gitignored) holds
  results.
- Coverage: 35,513 / 36,280 unique addresses (97.9 %). Bucketed:
  - `adres` (precise pin) — 19,072
  - `weg` (street-level only) — 10,686 *flagged uncertain*
  - `gemeente` (city centroid; demolished/renamed street) — 5,680 *flagged uncertain*
  - `woonplaats` / `postcode` / `buurt` — small numbers, mostly rural
- `HANDOFF_GEOCODE.md` (committed) is the original detached-run brief; it
  reflects the script *before* the alias work, so re-read with that caveat.

### 3. SQLite + FTS5 build (Slice B)

`scripts/build_db.py` (new) → `web/data/adresboek.sqlite` (45.9 MB,
gitignored). Tables: `pages`, `entries`, `entries_fts` (FTS5,
`unicode61 remove_diacritics 2`), `cross_references`. Reuses
`pipeline.json_export._collect_entries_for_index` so all section types
(name / street / occupation / institutional / advertisement / other) are
imported, not just name register.

End-to-end stats from the most recent build: **838 pages · 60,783 entries · 49,959 with lat/lng (82.2 %) · 5 overrides merged · 218 cross-refs**, in 2.8 s.

Geocoded coverage by section:

| section | total | geocoded |
|---|---|---|
| name_register | 27,845 | 99.1% |
| street_register | 22,080 | 92.2% |
| institutional | 5,545 | 28.2% |
| occupation_register | 5,162 | 5.6% |
| other | 118 | 97.5% |
| advertisement | 33 | 66.7% |

The `5.6 %` on occupation_register is real: those entries are people
listed under occupation headings, mostly without addresses. The `28.2 %`
on institutional is similarly explained — many institutions don't have a
clean street/number that PDOK matches.

Build is idempotent (drops + recreates everything) and re-runs cleanly
after CRM edits or geocoding additions.

### 4. /api/search route (Slice C foundation)

- `web/lib/db.ts` — better-sqlite3 singleton with `query_only=ON`, WAL
  journal. `buildFtsQuery` strips FTS operators and prefix-matches each
  token, AND-joined.
- `web/app/api/search/route.ts` — `GET /api/search?q=&limit=&offset=`,
  `runtime=nodejs`, `dynamic=force-dynamic`.
- Smoke verified in the dev server: `q=bakker` → `total=1200`, returns
  rows with `id`, `stable_id`, `stem`, `page_number`, `section`, name,
  occupation, `address_full`, `lat`, `lng`, all bboxes, `geocode_flags`,
  status flags.

`web/package.json` now has a `build:db` script that calls the Python
builder from the project root via `.venv/bin/python`.

### 5. Repo structure + GitHub setup

- Comprehensive `.gitignore` covering `scans/`, `Maps/`, `output/*` (with
  `!output/overrides/` to keep CRM edits), `tessdata/`, `.venv/`,
  `node_modules/`, `web/data/`, `.env*`, `pipeline/config_local.py`,
  `secrets.md`, `.tmp.*`, `.DS_Store`, `.claude/`.
- `README.md` rewritten with: repo layout, *required external assets*
  table, cross-platform setup, refresh-outputs path, full reference list.
- Legacy notes moved into `docs/archive/`; design HTMLs into
  `docs/design-ref/`.
- `output/overrides/` IS tracked — those are user CRM edits, not generated.

### 6. Things explicitly NOT done

- `web/components/SearchPanel.tsx` is **still page-scoped** — the new
  `/api/search` endpoint exists but the UI does not call it yet. The
  current SearchPanel filters `data.entries` (one page) client-side. The
  next move is to wire it in (or build a parallel global-search component);
  see *next-step options* below.
- `pipeline/preprocess.py` Tesseract leftovers not cleaned. `run_pipeline.py`
  still works on Windows (where pytesseract is installed) but errors on
  the macOS box. The refresh path avoids it.
- No DZI tiles, no OpenSeadragon, no MapLibre, no COG overlays, no Fly.io
  deploy yet — those are Slices D / E / F / G / J in `NEXT_STEPS.md`.

## What needs syncing per machine

`web/data/adresboek.sqlite` is gitignored. To get it on the other PC:

```bash
git clone https://github.com/lieuwe89/groningen-adresboek-1926.git
cd groningen-adresboek-1926
# Sync these from Drive (NOT in git):
#   output/json/                 (per-page entries)
#   output/overrides/            (CRM edits — actually IS in git, but
#                                  also synced via Drive for local edits)
#   output/geocoded/addresses.json
#   output/combined/             (used by build script)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd web
npm install
npm run build:db          # rebuilds web/data/adresboek.sqlite
npm run dev
```

If `output/json/` is too big to sync conveniently, the alternative is a
fresh extraction run, but for the public-site work the existing pilot
JSONs are fine.

## Decisions answered for the public-site phase

The user answered the four open questions from `docs/archive/website_plan.md`:

1. **Map layers** — 6 historical maps (already in `Maps/GeoTIFF/`) + 1
   modern map split into polygons + labels. The 6 historic GeoTIFFs are
   91 MB to 226 MB each (need COG conversion before serving).
2. **Hosting** — `playground.lieuwejongsma.nl/Groningen1926`. This means
   `basePath: "/Groningen1926"` in `next.config.ts` when we deploy.
3. **Page browsing** — sequential flip-through wanted, with a dropdown to
   jump to a section (front matter / inleiding / namenregister / streets
   / occupations / etc.). The dropdown should display the section labels,
   not just page numbers.
4. **Analytics** — skip (not wanted).

## Next-step options (sorted by leverage)

1. **Wire SearchPanel.tsx to `/api/search`** (~1–2 h). The piece every
   other UI feature builds on. Currently the API exists but no UI calls
   it. After this, search becomes book-wide instead of page-only, and
   results carry `stem`+`stable_id` so clicking can navigate.

2. **Slice F: MapLibre + markers** (~3–4 h). Replace the blueprint
   placeholder in `web/components/MapPanel.tsx` with a real MapLibre map,
   plot the 49,959 lat/lng entries with clustering, popups for marker
   clicks. Reads via a new `/api/markers?bounds=...` endpoint or just
   serves the full geocoded set as static JSON for v1.

3. **Slice G: COG historic overlays** (~2–3 h once #2 is done).
   `gdal_translate -of COG` over the 6 GeoTIFFs (output to `web/public/maps/`
   or a Fly volume), then `@geomatico/maplibre-cog-protocol` for runtime
   tile fetch. Layer-switcher UI with opacity slider per layer.

4. **Slice D + E: DZI tiles + OpenSeadragon** (~3 h). `brew install vips`,
   then `vips dzsave` over the 838 scans → ~2 GB of WebP tiles in
   `web/public/tiles/`. Replace plain `<img>` in ScanPanel with
   OpenSeadragon. SVG overlay for entry highlighting (re-using the bboxes
   already in the search response).

5. **Section-jump dropdown** (~1 h). Reads `pages.section` distinct values
   from SQLite, renders a `<select>` with `[Front matter — p. 1, Inleiding —
   p. 5, Naamregister — p. 119, ...]`, navigates to the first page of the
   chosen section. The data is already there.

6. **Pipeline backlog** (low priority for public-site work):
   - Clean stale `pipeline/preprocess.py` Tesseract code so
     `run_pipeline.py` runs on macOS. ~30 min.
   - LLM prompt iteration for `(B.)`/`E.` mis-reads. Sample-driven.

## Key file references

| File | What |
|---|---|
| `pipeline/refresh_outputs.py` | One-shot re-align + re-export, no network |
| `scripts/geocode_addresses.py` | PDOK batch geocoder (current version, alias-aware) |
| `scripts/build_db.py` | JSON+overrides+geocoded → `web/data/adresboek.sqlite` |
| `web/lib/db.ts` | better-sqlite3 connection + FTS query builder |
| `web/app/api/search/route.ts` | GET /api/search?q=&limit=&offset= |
| `web/package.json` | `npm run build:db` script |
| `NEXT_STEPS.md` | Full roadmap; Decisions §2; bbox postmortem §11 |
| `HANDOFF_GEOCODE.md` | Detached-PC run brief (pre-alias version) |
| `docs/archive/website_plan.md` | Full public-site plan with API shape, deploy details |
| `docs/archive/ui.md` | UI/UX layout, palette, interaction flows |

## To resume in a fresh Claude session

Open this file. Tell Claude: *"continue from HANDOFF.md"*. Pick one of
the **next-step options**.
