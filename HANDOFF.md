# Handoff — 2026-05-04 (Slice F: clickable BAG buildings + historic overlays)

This session pivoted Slice F mid-build. The first attempt rendered dot
markers per geocoded address; the user wanted clickable building
footprints instead. We discarded the dot work, ingested BAG, matched
1926 entries to building polygons, and shipped a map where you click a
house and a side panel lists every record at that address. Six
georeferenced 1926 GeoTIFFs are layered on top via COG with an opacity
slider.

Pushed to `origin/main`. Web app version bumped 0.2.1 → 0.3.0.

## TL;DR — where to resume

```bash
git pull
cd web && npm install
# Output that ships outside the repo (gitignored):
#   output/bag/                  built by scripts/ingest_bag.py + match_addresses.py
#   web/data/adresboek.sqlite    built by scripts/build_db.py
#   web/public/maps/             built by scripts/convert_historic_cogs.sh
# Re-run them on a clean checkout:
.venv/bin/python scripts/ingest_bag.py        # ~3 min, PDOK WFS
.venv/bin/python scripts/match_addresses.py   # ~5 s
.venv/bin/python scripts/build_db.py          # ~5 s, also picks up BAG
bash scripts/convert_historic_cogs.sh         # ~1 min, gdal_translate -of COG
npm run dev                                   # http://localhost:3001
```

In the running app:

- A real map fills the centre panel. Buildings with at least one 1926
  record are subtly outlined in amber. Hover thickens the outline and
  brightens the fill.
- Click any of those buildings → a `§ 4 — GEBOUW` panel opens, listing
  every entry at the matched addresses. Click an entry → navigates to
  the corresponding scan page with that entry highlighted.
- Bottom-left layer panel:
  - radio between Modern (no overlay) and the six historic GeoTIFFs
  - opacity slider for the active historic raster
  - toggle for the building polygons themselves
- Map position persists across page navigation (sessionStorage).

## Repo

- **GitHub:** https://github.com/lieuwe89/groningen-adresboek-1926
- **`origin/main` HEAD:** `4c6b31e` "Slice F: clickable BAG buildings + 6
  historic map overlays"
- **Local clone:** `/Users/lieuwejongsma/projects/groningen-adresboek-1926`
- **Working tree:** clean *for Slice F purposes*. Pipeline-engine WIP
  remains untracked / unstaged on `pipeline/align.py`, `pipeline/ocr.py`,
  `pipeline/config.py`, `pipeline/llm.py`, `pipeline/run_pipeline.py`,
  `pipeline/classifier.py`, `requirements.txt`, plus untracked
  `Dockerfile.dgx`, `pipeline/ocr/`, `pipeline/pagexml_export.py`,
  `pipeline/prompts/classify_section.txt`,
  `pipeline/prompts/patient_register.txt`, `pipeline/schemas/`. Also
  `scripts/geocode_addresses.py` has user-side edits (PDOK
  `gemeentenaam → woonplaatsnaam`, `--reset-haren`). All carried over
  from prior sessions; not touched here.

## What landed this session

### 1. Pre-Slice-F: stable_id flatten — commit `fd678da` (Slice C2)

Before pivoting to Slice F, this session's first commit closed the
NEXT_STEPS §12 punch list: ported the Python flattener
`_collect_entries_for_index` to TS at `web/lib/flatten.ts`, applied it
inside `loadPage` and `loadPageRaw`, verified per-stem TS == DB on all
838 pages. Browser-tested by clicking a `street_register` global hit
on Pelsterstraat 43 — lands on the highlighted row, no more blank stub.
Web bumped 0.2.0 → 0.2.1.

### 2. BAG ingest — `scripts/ingest_bag.py`

Pages PDOK BAG WFS for `bag:pand` and `bag:verblijfsobject` within the
city bbox (`53.18, 6.50, 53.245, 6.65`). The original implementation
hit PDOK's hard cap on `startIndex` at 50,000; the fix is a quad-tree
that recursively splits any sub-bbox whose `numberMatched` exceeds the
cap, with `identificatie`-keyed dedupe across overlapping splits.

`srsName=EPSG:4326` is required — without it BAG returns its native RD
(EPSG:28992) coordinates and everything downstream goes wrong by a
factor of 100,000.

Outputs in `output/bag/`:
- `verblijfsobjecten.geojson` — 121,617 VBO points, line-delimited
- `panden.geojson` — 88,118 building polygons, line-delimited
- `buildings.geojson` — joined, one feature per pand with `addresses[]`

### 3. Address matching — `scripts/match_addresses.py`

Builds a key per BAG VBO of `(normalized_street, huisnummer, huisletter)`
and indexes them, applying alias expansion on **both** the BAG side and
the book side at lookup time. The alias set covers:

- Dutch abbreviation conventions (`St.` → `Sint`, `Gebr.` → `Gebroeders`,
  `Gerbr.` → `Gerbrand`, `Sav.` → `Savornin`, `Jhr.` → `Jonkheer`,
  `Mr.` → `Meester`, etc.)
- 1947 spelling reform pairs (`heere↔here`, `groote↔grote`,
  `hooge↔hoge`, `visch↔vis`, plus a few more)
- Particle prefix variants (`De Savornin Lohmanlaan` ↔ `Savornin
  Lohmanlaan`)
- Dash/space variants

Address parsing strips trailing periods/commas/parens, repairs
hyphenated line breaks, and falls back to the tail after the last comma
if a business-name prefix is detected.

**Match rate: 44.7%** (22,256 entries → 8,898 buildings with ≥1
record). The remaining 55% is dominated by streets renamed entirely
since 1926, demolished/renumbered buildings, multi-address phrasing
(`Oosterkade 3, 4, 5 en 13`), and edge cases not in the alias list.
Per user direction unmatched are simply hidden from the map; manual
pinning is queued for later.

### 4. DB extension — `scripts/build_db.py`

- New column `entries.pand_id` (nullable), populated from
  `output/bag/match.json`.
- New table `buildings` (`pand_id` PK, `geometry` as GeoJSON text,
  `bbox_*`, `centroid_*`, `address_count`, `entry_count`). Only pand
  with at least one matched 1926 record are inserted.
- Index on `entries.pand_id` for the `/api/buildings/[pand_id]` join.

`build_db.py` aborts gracefully if the BAG match file is absent — it
just leaves `pand_id` NULL and the buildings table empty.

### 5. Historic COGs — `scripts/convert_historic_cogs.sh`

`gdal_translate -of COG -co COMPRESS=JPEG -co QUALITY=80 -co
BLOCKSIZE=512 -co OVERVIEW_RESAMPLING=AVERAGE` over each TIF in
`Maps/GeoTIFF/`. Output to `web/public/maps/<id>.cog.tif`. Total: 738
MB raw → 73 MB JPEG-COG. The script is idempotent (skips files where
the COG is newer than the source). `web/public/maps/` is gitignored.

### 6. Buildings API — `web/app/api/buildings/route.ts` and `[pand_id]/route.ts`

- `GET /api/buildings` returns a FeatureCollection of every building
  with at least one record. ~3.5 MB JSON, 8898 features.
- `GET /api/buildings/<pand_id>` returns `{centroid, bbox, addresses}`
  with each address grouping its 1926 entries.

`web/lib/db.ts` now reopens the better-sqlite3 connection if the
underlying file's inode changes. This was needed so that re-running
`scripts/build_db.py` (which `unlink`s the DB file) is picked up by
the dev server without restarting it.

### 7. Map UI — `MapView.tsx`, `BuildingPanel.tsx`, `MapPanel.tsx`

- `MapView.tsx` initialises a MapLibre map with the Carto dark
  basemap (`basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png`),
  registers the `cog://` protocol once per module load (guarded
  against double-registration under StrictMode and HMR), and adds the
  buildings GeoJSON source with `promoteId: "pand_id"` so feature-state
  hover works.
- The fill layer is on top with a transparent paint that flips to a
  14% (32% on hover) amber tint, so the polygon is the click target
  even when a historic raster is rendered underneath. The line layer
  renders an amber outline that thickens on hover.
- The historic layer is added between the basemap and the buildings
  line, with `paint["raster-opacity"]` driven by the slider.
- Map centre + zoom persist via `sessionStorage` keyed
  `grn1926-map-pos`.
- `BuildingPanel.tsx` is a floating right-aligned card. It fetches
  `/api/buildings/<pand_id>` on open, groups entries by address, and
  navigates to `/page/<stem>?entry=<stable_id>` on click.
- `MapPanel.tsx` swaps its placeholder layers panel for a real one:
  modern + 6 historic radios, opacity slider, and a buildings toggle.

### 8. Plan + docs — `PLAN-slice-F.md`, `NEXT_STEPS.md` §13

`PLAN-slice-F.md` is the design doc the user approved before the build
ran. `NEXT_STEPS.md` §13 is a forward-facing summary of what shipped
and what's still loose.

Web version `web/package.json` 0.2.1 → 0.3.0.

## Known caveats (still open)

### 55% of geocoded entries don't map to a building

Hidden from the map per user direction. Causes seen in the no-match
sample:
- streets renamed entirely (e.g. `Zuidersingelstraat`)
- buildings demolished or renumbered post-1926
- multi-address phrasing (`Oosterkade 3, 4, 5 en 13`) — parser keeps
  only the last number
- business-name prefix not stripped cleanly
- `Hooge der A 36b` exists in BAG as `Hoge der A 36a` (no `b` modern)

Plan: add a manual pinning UI later so the user can geo-locate a 1926
entry by clicking a footprint. That bypasses BAG addressing entirely
and is robust to all the above.

### glyphs URL points at maplibre demo CDN

`MapView.tsx` style spec sets `glyphs:
"https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"`. We
don't currently use any symbol layers, so it's only here as a guard
against future-additions silently failing. For production we should
self-host glyphs (or drop them entirely if we never add labels).

### Carto dark_nolabels is OSM tiles via Carto

Free tier; attribution required and present. If we hit Carto's fair-use
policy in production we'll need to switch to self-hosted vector tiles.

### Map slow to render on first visit

First-paint of the buildings layer takes ~15–20 s on a fresh load while
Carto fetches ~9 raster tiles, then 3.5 MB of GeoJSON parses. Subsequent
navigations are instant. Worth profiling before deploy.

### Unrelated WIP still on disk

The `pipeline/*` engine-abstraction work is parked. `build_db.py` and
`json_export.py` were touched only minimally during this session;
nothing in this Slice F commit conflicts with the WIP. Same goes for
`scripts/geocode_addresses.py` (PDOK `woonplaatsnaam` filter, Haren
reset flag) — left as-is.

## Next-step options (sorted by leverage)

1. **Manual pinning UI for unmatched entries** (~3 h). The 55% gap is
   the next obstacle to a "complete" map. A simple flow: from the
   admin entry editor (already shipped earlier), click a building on
   the map to set `pand_id` directly. Persist as override.

2. **Slice E + D: DZI tiles + OpenSeadragon** (~3 h). The biggest
   remaining content gap is that the per-page scan still uses a flat
   `<img>`. With BAG plumbing done, swapping to DZI is independent
   work. Same `vips dzsave` recipe in the original
   `docs/archive/website_plan.md`.

3. **Self-host map basemap + glyphs** (~2 h, before deploy). Replace
   the Carto raster tiles and the demo glyphs with self-hosted tiles
   — likely PMTiles + MapLibre vector style. Frees us from Carto's
   fair-use limits and makes the deploy fully offline-capable.

4. **Search → map** (~1 h). Click a global-search hit → fly the map to
   that pand. Needs the matched `pand_id` plumbed into `SearchHit`,
   then a `MapView` imperative handle.

5. **Pipeline backlog** (low priority for the website). Land the
   engine-abstraction WIP. Re-run on a fresh book with the cleaner
   pipeline.

## Key file references (delta this session)

| File | What |
|---|---|
| `scripts/ingest_bag.py` | New — BAG WFS quad-tree pull |
| `scripts/match_addresses.py` | New — book → BAG match with aliases |
| `scripts/convert_historic_cogs.sh` | New — `gdal_translate -of COG` per layer |
| `scripts/build_db.py` | + `pand_id` column + `buildings` table |
| `web/app/api/buildings/route.ts` | New — FeatureCollection of buildings |
| `web/app/api/buildings/[pand_id]/route.ts` | New — building detail |
| `web/components/MapView.tsx` | New — MapLibre + buildings + COG layers |
| `web/components/BuildingPanel.tsx` | New — floating side panel |
| `web/components/MapPanel.tsx` | Replaced placeholder with real layer switcher |
| `web/lib/db.ts` | + `listBuildings`, `getBuilding`; inode-aware reopen |
| `web/lib/historicMaps.ts` | New — catalogue of 6 historic GeoTIFFs |
| `web/lib/flatten.ts` | New (Slice C2) — TS port of Python flattener |
| `web/lib/data.ts` | Slice C2 — `loadPage` flattens before merge |
| `PLAN-slice-F.md` | New — slice plan, decisions, build sequence |
| `NEXT_STEPS.md` | + §13 (Slice F summary), §12 marked fixed |
| `web/package.json` | 0.2.1 → 0.3.0 (this commit), 0.2.0 → 0.2.1 (Slice C2) |
| `.gitignore` | + `web/public/maps/` |

## To resume in a fresh Claude session

Open this file. Tell Claude: *"continue from HANDOFF.md"*. The most
natural next step is **manual pinning of unmatched entries** (option
#1) — it closes the gap most visible on the map, and the admin
infrastructure for it already exists.
