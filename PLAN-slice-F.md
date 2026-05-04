# Slice F — Plan: Clickable building map + historic overlays

Status: **draft, awaiting approval**
Author: 2026-05-04
Supersedes: dot-marker WIP (uncommitted, discarded per user)

## Goal

Replace the placeholder map panel with a real MapLibre map where:
- Modern building footprints (BAG `pand`) are subtly outlined.
- Buildings that have one or more 1926 records attached are visibly differentiated and clickable.
- Clicking a building opens a side panel listing every 1926 entry recorded at any address inside that footprint.
- A layer switcher lets the user toggle between the modern basemap and any one of six 1926 historic GeoTIFFs (or none, falls back to modern).
- Building click-zones still work when a historic raster is on top.

Out of scope for this slice (deferred):
- Address-number labels at zoom ≥ 18 (needs glyphs source).
- Manual geolocation of records that don't match BAG.
- Static dot markers (the prior approach we just discarded).

## Inputs

### BAG building data
- Source: PDOK BAG. Two object types we care about:
  - `verblijfsobject` (VBO) — addressable unit, has `huisnummer` + `huisletter` + `huisnummertoevoeging` + `postcode` + `gerelateerd_pand` (FK to building).
  - `pand` — building polygon.
- City of Groningen extent (pre-2019 merger, where the 1926 book records live):
  - bbox EPSG:4326 ≈ `[6.50, 53.18, 6.65, 53.25]`
- Volume estimate: ~80k VBOs, ~30k pand polygons in this bbox.
- Output of ingestion: a single `output/bag/buildings.geojson` keyed by `pand_id`, each feature carrying `addresses: [{vbo_id, huisnummer, huisletter, toevoeging, postcode, openbareruimte}]`.
- Query path: PDOK BAG WFS (`https://service.pdok.nl/lv/bag/wfs/v2_0`) with bbox filter, paged. Or BAG GeoPackage download from kadaster.nl, then `ogr2ogr` extract bbox. WFS is simpler for a one-shot pilot ingest.

### Historic maps
Already on disk at `Maps/GeoTIFF/`:

| File | Size | Pixel res | Bbox EPSG:4326 |
|---|---|---|---|
| `0817_00950-1_0001.tif` | 87 MB | 1.03 m/px | [6.533, 53.187 — 6.596, 53.241] |
| `1536_1237.tif` | 88 MB | 1.32 m/px | [6.521, 53.175 — 6.621, 53.248] |
| `1536_1554.tif` | 31 MB | 1.10 m/px | [6.543, 53.202 — 6.582, 53.232] |
| `1536_1698.tif` | 126 MB | 0.99 m/px | [6.528, 53.183 — 6.604, 53.240] |
| `1536_6133.tif` | 216 MB | 0.55 m/px | [6.535, 53.197 — 6.591, 53.237] |
| `1536_6138.tif` | 190 MB | 1.21 m/px | [6.489, 53.177 — 6.636, 53.252] |

All raw GeoTIFF, EPSG:4326. Total 738 MB raw — must be converted to either COG (Cloud Optimized GeoTIFF) for HTTP range fetch via `@geomatico/maplibre-cog-protocol`, or to MapLibre raster tiles via `gdal2tiles.py` and served as static `{z}/{x}/{y}.png`.

We pick **COG** because:
- One file per layer (no thousands of tile PNGs in the repo).
- MapLibre has a community protocol that fetches only the visible tiles via byte-range.
- gdal_translate -of COG is a single command per file.

Per-file COG output target: typically ~30–60% of the source size (lossless DEFLATE) or much smaller if we accept JPEG compression in the COG. We'll use JPEG for color rasters where quality artifacts are acceptable (these are scanned historic maps, not measurement data).

## Architecture

### Data layer

1. **Ingestion script** `scripts/ingest_bag.py`
   - Pages the PDOK BAG WFS for `pand` and `verblijfsobject` within the city bbox.
   - Joins VBO → pand via `gerelateerd_pand`.
   - Writes `output/bag/buildings.geojson` (FeatureCollection of pand polygons with VBOs nested).
   - Idempotent; resumable via a checkpoint file.

2. **Address matching** in `scripts/match_addresses.py`
   - Reads all DB entries with `lat IS NOT NULL`, normalizes `address_full` the same way the geocoder does.
   - For each VBO, builds a key like `<openbareruimte_lc>|<huisnummer><huisletter>` (`huisnummertoevoeging` ignored unless we hit it as a fallback).
   - Matches book entries → VBO → pand.
   - Output: `output/bag/match.json` mapping `pand_id` → `{addresses: {address_full: {entries: [stable_id], lat, lng}}}`.

3. **DB extension** in `scripts/build_db.py`
   - Adds a `pand_id` column to `entries` (nullable).
   - Populated from `match.json`.
   - New table `buildings`: `id, pand_id, geometry (GeoJSON text), bbox`.
   - New endpoint `GET /api/buildings` returns aggregated buildings with `entry_count` per pand.

### Map layer

4. **COG conversion** `scripts/convert_historic_cogs.sh`
   - For each TIF in `Maps/GeoTIFF/`: `gdal_translate -of COG -co COMPRESS=JPEG -co QUALITY=80 -co BLOCKSIZE=512 input.tif web/public/maps/<id>.cog.tif`.
   - Output goes to `web/public/maps/`. Total estimated size ~150–250 MB after JPEG compression.
   - Note: `web/public/` ships with the Next.js bundle, so for a Fly deploy these probably need to live on the volume — handled at deploy time, out of scope here. For local dev `public/` is fine.
   - Add `web/public/maps/` to `.gitignore` (large binary blobs).

5. **MapView client component** `web/components/MapView.tsx`
   - Basemap: Carto `dark_nolabels` raster (free, attribution-required).
   - Sources:
     - `buildings` — GeoJSON from `/api/buildings`, no clustering.
     - `historic-N` (N=1..6) — `cog://` raster, only the active one is on the map at any time.
   - Layers (top → bottom):
     - `buildings-fill` — `fill-color: transparent`, click target.
     - `buildings-fill-active` — `fill-color: #e8b84c`, `fill-opacity: 0.18` for has-records buildings.
     - `buildings-line` — `line-color: #e8b84c44`, only on has-records.
     - `historic-active` — raster, conditionally added when user picks one.
     - `carto-base` — basemap.
   - Click handler on `buildings-fill`: query rendered features at point → fetch `/api/buildings/:pand_id` → push entries into a side panel.
   - Hover: change cursor + bump `buildings-line` opacity for the hovered pand.
   - Layer switcher UI in the existing `Kaartlagen` panel:
     - Six radio rows (`1936`, `1922`, …) plus a `Modern` row that shows no historic raster.
     - The `Adresmarkeringen` row from the dot-marker iteration is removed.

6. **Side panel** `web/components/BuildingPanel.tsx`
   - New right-of-map panel that opens when a building is clicked.
   - Lists every entry in that pand grouped by address: `Pelsterstraat 41 (3)` → entries.
   - Each entry click navigates to `/page/<stem>?entry=<stable_id>` (matches existing search-hit behavior).

### Wiring

- The existing search panel still works; clicking a search hit still navigates to the page. (Phase later: pan map to that pand.)
- The existing scan panel and section dropdown are unchanged.

## Build sequence

| # | Step | Approx effort | Verifies |
|---|---|---|---|
| 1 | `scripts/ingest_bag.py` — WFS pull, write `output/bag/buildings.geojson` | 60–90 min | feature count ≥ 25k, sample feature has `addresses[]` |
| 2 | `scripts/match_addresses.py` — match book entries to VBO/pand | 45 min | match rate report (target: ≥ 70% of geocoded entries match a pand) |
| 3 | DB schema bump in `build_db.py` + `pand_id` populated | 30 min | DB count of `entries.pand_id IS NOT NULL` matches step 2 report |
| 4 | `GET /api/buildings` endpoint | 30 min | returns FeatureCollection, `entry_count > 0` for matched pand |
| 5 | `MapView.tsx` rewrite with building source + click | 60 min | click on pand opens popup with stub data |
| 6 | `BuildingPanel.tsx` + wire click into Viewer state | 45 min | click → side panel lists entries, click entry → navigates |
| 7 | `convert_historic_cogs.sh` + `web/public/maps/` | 30 min (mostly waiting) | one COG visibly renders in MapView |
| 8 | Layer switcher UI for 6 historic + modern + add `pmtiles` / `cog` protocol registration | 60 min | toggling between layers works, building click still works on top of historic |
| 9 | Cleanup, NEXT_STEPS update, version bump, commit | 30 min | tests/screenshot proof |

Total: 6–8 h, vs the 3–4 h originally scoped for dots — the building-polygon path is heavier but the result is the right end-state.

## Decisions

| Area | Decision | Rationale |
|---|---|---|
| Footprint source | BAG via PDOK WFS | Free, authoritative, matches modern addresses |
| Match strategy | `openbareruimte` + `huisnummer(+letter)` | Closest to how book addresses are written |
| Unmatched records | Hidden from map for now | User will manually pin later |
| Historic format | COG with JPEG compression | One file per layer, range-fetch from MapLibre |
| Layer model | One historic XOR none, never multiple | Keeps UI simple; matches user spec |
| Click target above raster | Transparent fill on top of raster | MapLibre raster doesn't intercept clicks anyway, but explicit ordering is safer |
| Address-number labels | Deferred to v2 | Needs glyphs source, out of scope |

## Risks

1. **PDOK WFS rate limiting / pagination edge cases.** Mitigation: small page size + retries with backoff.
2. **Match rate too low** (e.g. < 50%). If so, we add a tier-2 marker layer for unmatched records as a fallback and re-evaluate.
3. **COG JPEG artifacts on old map scans.** If quality is bad, fall back to `COMPRESS=DEFLATE` per layer at the cost of bigger files.
4. **Performance of 30k pand polygons in MapLibre.** Should be fine — vector clustering not needed because polygons render efficiently. If a problem, we move to pre-baked vector tiles (PMTiles via tippecanoe).

## Resolved questions

- **1926 vs modern address.** Treat them as the same — we don't have a 1926→modern concordance and most central Groningen streets are unchanged. Side panel header shows the 1926 address as recorded. *(Confirmed by user 2026-05-04.)*
- **Historic overlay vs basemap.** Historic fully replaces the basemap when active, but the layer switcher gets a **transparency slider** (`fill-opacity` on the historic raster, 0–100%). At 0% only the modern basemap shows; at 100% the historic fully covers. *(Confirmed by user 2026-05-04.)*

## Acceptance criteria

- All 838 book pages still load (200) — Slice C2 fix not regressed.
- `/api/buildings` returns ≥ 5k features with `entry_count > 0`.
- Clicking a building with multiple addresses shows all entries grouped by address.
- Clicking a building with no records does nothing (or shows an empty hover state).
- The six historic GeoTIFFs each render cleanly when selected.
- Building polygons remain clickable when a historic overlay is active.
- No console errors on map init.
- Browser-tested, screenshot proof.

