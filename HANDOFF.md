# Handoff — 2026-05-04 (Slice E: deep-zoom scan viewer)

This session shipped Slice E from the prior handoff's option list:
swap the per-page raw `<img>` for an OpenSeadragon viewer over DZI
tile pyramids. Pushed to `origin/main`. Web bumped 0.3.0 → 0.4.0.

## TL;DR — where to resume

```bash
git pull
brew install vips         # one-time, libvips for dzsave
cd web && npm install
# Tile output ships outside the repo (gitignored):
bash scripts/generate_dzi.sh   # ~5 min on M-series, 838 scans -> ~870 MB
npm run dev                    # http://localhost:3001
```

Open any `/page/<stem>` and click the **Scan** toggle on the right
panel. The scan opens in OpenSeadragon. The active entry's bbox is
highlighted in amber; if it's off-screen the viewport auto-fits to it
with 20% padding. Double-click the scan to go home. The +/⌖/− buttons
in the bottom-right of the panel still work — they call OSD's
`viewport.zoomBy` / `goHome` via an imperative ref.

## Repo

- **GitHub:** https://github.com/lieuwe89/groningen-adresboek-1926
- **`origin/main` HEAD:** `3577e3d` "Slice E: deep-zoom scan viewer
  (DZI + OpenSeadragon)"
- **Local clone:** `/Users/lieuwejongsma/projects/groningen-adresboek-1926`
- **Working tree:** clean *for Slice E purposes*. Pipeline-engine WIP
  remains untracked / unstaged (same files as prior handoff: pipeline
  align/classifier/config/llm/ocr/run_pipeline edits, requirements.txt,
  `Dockerfile.dgx`, `pipeline/ocr/`, `pipeline/pagexml_export.py`,
  `pipeline/prompts/classify_section.txt`,
  `pipeline/prompts/patient_register.txt`, `pipeline/schemas/`,
  plus user-side edits on `scripts/geocode_addresses.py`,
  `scripts/ingest_bag.py`, `scripts/match_addresses.py`,
  `web/app/api/buildings/route.ts`). All carried over; not touched
  here.

## What landed this session

### 1. Tile generation — `scripts/generate_dzi.sh`

`vips dzsave` over every JPEG in `web/public/scans/`, output to
`web/public/tiles/<stem>.dzi` + `<stem>_files/`. WebP tiles, 256 px,
Q=82, 1 px overlap, layout `dz`. Idempotent: skips when the .dzi
mtime is newer than the source. `web/public/tiles/` added to
`.gitignore`. Total: 838 scans → 872 MB of tiles.

### 2. OSD wrapper — `web/components/ScanViewer.tsx`

- `forwardRef` exposes `{ zoomBy(factor), reset() }`.
- Async-imports `openseadragon` (no SSR, dynamic-imported by
  `ScanPanel`).
- One viewer instance per panel; on `stem` change it calls
  `viewer.open(/tiles/<stem>.dzi)` rather than tearing down.
- `addHandler("open", ...)` reads `world.getItemAt(0).getContentSize()`
  and stores image dims in a ref so `applyBbox` can build the viewport
  rect via `viewport.imageToViewportRectangle(x, y, w, h)`.
- Bbox overlay is a `<div>` injected via `viewer.addOverlay`; replaced
  on each bbox change. CSS: 2 px amber border, 27%-alpha amber fill.
- Auto-refocus: if the bbox isn't fully inside `viewport.getBounds()`
  it `fitBoundsWithConstraints` a rect padded 20% on each axis.
- `gestureSettingsMouse.dblClickToZoom` is off; a custom
  `canvas-double-click` handler calls `viewport.goHome()`.

### 3. Panel refactor — `web/components/ScanPanel.tsx`

Removed the entire manual pan/zoom block: `dim`, `container`, `zoom`,
`pan`, `dragging`, `dragStart`, `baseScale`, `dispW`, `dispH`,
`zoomRef`, `panRef`, `clampPan`, `centerPan`, `zoomBy`, `onWheel`,
`onMouseDown/Move`, `stopDrag`, the bbox-percentage div, the wheel
event preventDefault. The non-bbox-edit branch now renders a
`<ScanViewer>` plus the existing zoom buttons calling the ref.

`BboxEditor` mode (Konva on the raw JPEG) is unchanged — that flow
still loads `/scans/<stem>.jpg` directly.

### 4. Bumps + docs

- `web/package.json` 0.3.0 → 0.4.0.
- `NEXT_STEPS.md` § 14 added with the slice summary, the one quirk
  (see below), and the deferred items.

## One quirk worth pinning

`vips dzsave --suffix .webp[Q=82]` looks fine on the man page. In a
bash script with `shopt -s nullglob` (which we need for the `for f in
"$SRC_DIR"/*.jpg` loop) the unquoted `[Q=82]` is read as a character
class glob, fails to match anything, and is silently elided. vips then
sees `--suffix --tile-size ...` and dies with `too many arguments`.
Quote it: `--suffix '.webp[Q=82]'`.

## Known caveats (still open)

### `web/public/tiles/` is large and many small files

872 MB for 838 dzi+_files trees. Works under `next dev` and `next
start` because everything in `public/` is served statically without
being bundled, but if Turbopack startup ever gets slow it's worth
moving the tree to `web/dzi/` and routing it via a tiny
`app/dzi/[...path]/route.ts` that streams from the filesystem.

### Tiles are local-only (not on Fly)

Same gotcha as Slice F's BAG and the historic COGs and (in
archie-chatbot) the OAI catalog: Fly volumes are per-machine, not
shared. Whenever we redeploy, the tiles need to be uploaded to each VM
separately. SFTP `put` from `flyctl ssh sftp shell` will refuse to
overwrite, so plan an `rm -rf /data/tiles/*` step first.

### Glyphs URL still on the demo CDN

Unchanged from Slice F handoff. Carto basemap + maplibre demo glyphs.
Self-host before deploy.

## Next-step options (sorted by leverage)

1. **Manual pinning UI for unmatched entries** (~3 h). Still the
   biggest map gap (55%). Admin entry editor exists; click a building
   on the map to set `pand_id` directly.

2. **Self-host basemap + glyphs** (~2 h, before deploy). PMTiles +
   MapLibre vector style. Frees us from Carto's fair-use limits.

3. **Search → map fly-to** (~1 h). Click a global-search hit → fly
   the map to that pand. Needs `pand_id` plumbed into `SearchHit`,
   then a `MapView` imperative handle (mirrors the one we just gave
   ScanViewer).

4. **Tile delivery polish** (~1 h). Move tiles out of `public/` if
   dev startup gets sticky; pre-cache the next/prev page's `.dzi` on
   hover; consider stripping unused OSD plugins from the client
   bundle.

5. **Pipeline backlog** (low priority for the website). Land the
   engine-abstraction WIP. Re-run on a fresh book with the cleaner
   pipeline.

## Key file references (delta this session)

| File | What |
|---|---|
| `scripts/generate_dzi.sh` | New — `vips dzsave` per scan, idempotent |
| `web/components/ScanViewer.tsx` | New — OpenSeadragon wrapper with bbox overlay + auto-refocus |
| `web/components/ScanPanel.tsx` | Removed manual zoom/pan; calls ScanViewer in non-bbox-edit branch |
| `.gitignore` | + `web/public/tiles/` |
| `NEXT_STEPS.md` | + § 14 Slice E summary |
| `web/package.json` | 0.3.0 → 0.4.0 |

## To resume in a fresh Claude session

Open this file. Tell Claude: *"continue from HANDOFF.md"*. Most
natural next step is **manual pinning of unmatched entries**
(option #1) — same recommendation as the prior handoff; Slice E
didn't change that calculus.
