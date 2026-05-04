# Handoff — 2026-05-03 (Round 3: bbox cluster fix)

Round 3 = pipeline-side bbox bug, root-caused and fixed. Round 2 (web CRM, below) still stands. To resume:

- **If continuing on the web CRM** → see "Round 2" section below; nothing changed for that work.
- **If picking up bbox refresh** → run `python pipeline/run_pipeline.py` from the project root to rebuild `output/json/`, `output/alto/`, `output/combined/` with corrected bboxes. No Surya re-run, no LLM cost — uses caches in `output/hocr/` and `output/llm_raw/`. ETA: minutes, not hours.

## What was wrong

Entry/name bboxes were systematically shifted right of the visible text on every page. Surnames in the name register fell *outside* their own entry's bbox. Ad-page bboxes started ~150–400 px inside the actual ad. Surface symptom user reported: "bboxes consistently start too far to the right."

Root cause: Surya's per-word bboxes occasionally collapse — N-1 words on a row share one cluster bbox covering only a sub-range of the line, while the trailing word gets a wider bbox. The pipeline's `_repair_word_bboxes` pass had a 30 % diversity threshold that the trailing word lifted past, so repair never fired on the dominant failure pattern. Even when it did fire, it redistributed across the wrong span (word cluster, not line bbox).

Full postmortem in `NEXT_STEPS.md` §11.

## What changed

- **`pipeline/ocr.py`** — rewrote `_repair_word_bboxes`:
  - Detection: "majority of words share a cluster" instead of the old 30 % distinct-bboxes threshold.
  - Redistribution: spans `OcrLine.bbox` (correct line bounds), with y from the words themselves.
  - Idempotent — already-distinct word bboxes don't re-trigger.
  - Validated against real cache data: `G. BEUTE` line (page 0153) and `Beukema (B.)` line (page 0152) now redistribute over their full line span, including the surname/title.

- **`NEXT_STEPS.md`** — §1 status updated; new §11 postmortem with: what was wrong, root cause, the fix, refresh instructions, future-detection runbook (rendered overlay script + line-vs-word-cluster invariant), v2 lessons, earlier hints we missed.

- **No web/admin changes** this round. CRM behaviour identical.

## Refresh existing outputs (one command)

```bash
cd /Users/lieuwejongsma/projects/groningen-adresboek-1926
python pipeline/run_pipeline.py
```

`_load_cache` applies the new repair on every cache read, so existing OCR caches yield correct word bboxes in-memory without re-running Surya. The pipeline re-aligns from `output/llm_raw/` (no LLM calls) and re-exports JSON + ALTO + combined indexes. Existing `output/json/<stem>.json` files will be rewritten with corrected `entry_bbox`, `name_bbox`, `address_bbox`. After the run, refresh the web app and verify a few stems where the shift was most visible (0150, 0151, 0152, 0153).

## Verification done in this round

- Pulled JSON + cache for several stems; confirmed cluster pattern in cache (e.g. on page 0152 line `[248, 305, 1035, 337]`, all 7 leading words clustered at `[443, 312, 839, 329]`).
- Drew JSON `entry_bbox` directly onto JPEGs with `~/Documents/claude-output/bbox_debug.py` to prove the shift was in the data, not the renderer.
- Walked the rendered web UI's bbox div via DevTools (`getBoundingClientRect` ratios) — confirmed the renderer is correct; bbox div is at `bbox[0] / dim.w` of the displayed image, no drift.
- Ran the new repair logic standalone against real cache lines and confirmed: `G.` now at x=169, `48,` at x=1682; `Beukema` now at x=248–356 instead of being entirely outside the bbox.

## Diagnostics kept for reuse

- `~/Documents/claude-output/bbox_debug.py` — given a stem, reads `output/json/` + `scans/` and writes a PNG with all entry bboxes drawn over the JPEG. Use any time bbox alignment looks off in the UI.
- `~/Documents/claude-output/bbox_debug2.py` — adds header/footer bbox overlays + every word outline. For broader page-level diagnosis.

## Items intentionally NOT done

- Did not commit / clean up `web/`, `.claude/`, `.tmp.*` etc. Those were untracked at session start; out of scope for this fix.
- Did not write the script to detect/fix the cluster-bbox issue retroactively in `output/hocr/` cache files. The runtime repair on cache load is sufficient — caches are not consumed outside the pipeline.
- Did not address other pipeline data-quality issues (LLM text errors, low cross-reference count, `address_full` duplication). Out of scope; tracked in `NEXT_STEPS.md` §1.

## Heads-up flagged for later

- `pipeline/config_local.py` has API keys in plaintext (`OPENROUTER_API_KEY`, `GOOGLE_AI_API_KEY`). A spawn-task chip exists to verify gitignore status and rotate if compromised. Not actioned yet.
- LLM mis-read on page 0152 entry [0]: `initials='E.'` for what is actually `(B.)` on the scan. Tip-of-iceberg for prompt-side OCR-correction errors. Add to LLM prompt iteration backlog if not already there.

## To resume in fresh Claude session

Open this file and tell Claude "continue from HANDOFF.md". Round 3 work is committed; pick up from "Refresh existing outputs" above if you want to regenerate the JSON/ALTO data, or jump back to Round 2's checklist for web CRM work.

---

# Handoff — 2026-05-03 (Round 2 close)

Builds on `HANDOFF.md` from earlier same day (Round 1 — foundation slice + text edit slice). Round 2 is **complete except for two deferred items**: word-bbox redistribution (item 3) and stable-ID reconcile script (item 2).

## Where to resume

```bash
cd /Users/lieuwejongsma/projects/groningen-adresboek-1926/web
npm run dev
```

Default: http://localhost:3001 → redirects to `/page/1769_19525-1926_0150` (public).
Admin: http://localhost:3001/admin/page/1769_19525-1926_0150 (basic-auth: `admin` / `devpass`, set in `web/.env.local`).
Stats: http://localhost:3001/admin/stats (admin only).

## Built this session (Round 2)

### Item 1 — Konva bbox editor
- `web/components/BboxEditor.tsx` — Konva `Stage` with native pan (Stage drag), wheel zoom (cursor-anchored), zoom buttons (`+`/`-`/`⌖`), dblclick reset, auto-refocus on entry change. `Rect` + `Transformer` with handles auto-scaled by `1/stageScale` so they stay constant screen size at any zoom. Rect drag-bound to image bounds. Save/revert UI with dirty tracking.
- `web/components/ScanPanel.tsx` — admin-only "Bewerk bbox" toggle in scan panel header. `next/dynamic({ssr:false})` swaps scan rendering for `<BboxEditor>` when toggled on. Resets on stem change.
- `web/app/api/admin/page/[stem]/entry/[idx]/route.ts` — extended PATCH to accept `bbox`: 4 ints, `x2>x1`, `y2>y1`, `≥0`; rejects with 400 on invalid. Sanitiser also added for `flags` (allowlist of 3 keys, boolean values only).
- Deps: `konva@10.3.0` + `react-konva@19.2.3` (React 19 compat).
- Verified end-to-end: `PATCH {bbox:[100,200,500,300]}` → wrote override → public `/page/<stem>` HTML reflects merged `entry_bbox`, `name_bbox`/`address_bbox` untouched.

### Admin login button (drive-by request)
- `web/components/Header.tsx` — converted to client component (uses `usePathname`). Shows `Admin` button on public routes (links to `/admin/page/<current-stem>`); flips to `Publiek` on admin routes. Browser pops basic-auth dialog on first admin click; auth caches for the session.

### Focus mode (drive-by request — admin viewport was too small)
- `web/components/ScanPanel.tsx` — admin-only "Focus" toggle. When on:
  - SearchPanel + MapPanel hidden (`!focusMode &&` in Viewer)
  - Global Header + Footer hidden
  - Scan panel goes from fixed `width:415` to `flex:1 width:100%`
  - In bbox edit mode, the entry-summary block + EditForm also hide (no point editing text + bbox at the same time)
- Net gain: ~620px more vertical height for the Konva canvas. At 800px viewport, canvas grew from ~280px to ~713px (≈2.5×).
- Toggle in scan panel header: "Focus" / "Smal".

### Item 4 — Filter UI + verified flag
- `web/lib/data.ts` — `Entry.flags?: { verified, needs_review, bbox_unreliable }` typed.
- `web/lib/overrides.ts` — `applyOverride` merges `ov.flags` onto entry.
- `web/components/SearchPanel.tsx` — exports `StatusFilter` type. Filter row: `Alle / Goed / Twijfel / Open`. Entry rows show small color dot if flagged (green = verified, amber = needs_review). **Both gated behind `showStatus` prop** — only render when `editMode` is true.
- `web/app/page/[stem]/Viewer.tsx` — filter logic: combines text query with status filter (`verified` / `needs_review` / `unreviewed`). Passes `showStatus={editMode}` to SearchPanel.
- `web/components/EditForm.tsx` — three checkbox row (Goed / Twijfel / Bbox slecht). Goed and Twijfel mutually exclusive. PATCH only sends changed flags. Revert restores both fields and flags.

### Item 5 — Stats dashboard
- `web/lib/stats.ts` — `computeStats()` walks all 838 JSONs + overrides; returns `{overall, bySection[], byPage[]}` with counts for verified / needs_review / bbox_unreliable / edited / unreviewed.
- `web/app/admin/stats/page.tsx` — server component, `dynamic="force-dynamic"`. Renders summary cards (6), 4 progress bars, per-section table, per-page table filtered to pages with edits (deep-link to admin editor).
- `web/components/Header.tsx` — admin-only `Stats` link (visible on any `/admin` route).
- Verified counts: 838 pages · 27,845 entries (name_register only).

## Surprise the data revealed

The stats page made one thing obvious: **street_register / occupation_register / institutional sections have ZERO extracted entries** despite having 196+37+104 = 337 pages. The pipeline didn't return structured entries for them in the pilot. Logged informally — fix the prompts before book #2. Already on the pipeline backlog (`NEXT_STEPS.md` §7).

## File map (changes this session)

```
web/
  app/
    admin/
      stats/page.tsx         — NEW: dashboard
  components/
    BboxEditor.tsx           — NEW: Konva canvas
    Header.tsx               — client now (usePathname); Admin/Publiek + Stats buttons
    ScanPanel.tsx            — Focus + Bbox toggles, dynamic BboxEditor swap, summary/EditForm hidden in bbox edit mode
    SearchPanel.tsx          — status filter row + dot, gated behind showStatus
    EditForm.tsx             — Goed/Twijfel/Bbox slecht checkboxes
  lib/
    data.ts                  — Entry.flags typed
    overrides.ts             — applyOverride merges flags
    stats.ts                 — NEW: computeStats aggregator
  app/api/admin/page/[stem]/entry/[idx]/route.ts
                             — sanitizeBbox + sanitizeFlags allowlist
  app/page/[stem]/Viewer.tsx — focusMode + showStatus wiring; status filter logic
NEXT_STEPS.md                — §9: note about original semantic filters (deferred restore)
HANDOFF.md                   — this file (replaces previous)
```

## Round 2 status

| Item | Status | Notes |
|---|---|---|
| 1. Konva bbox edit | ✅ shipped | Manual drag/resize feel still untested in browser (headless drag is awkward). Recommend a quick spin to confirm. |
| 2. Stable-ID reconcile script | ⏸ deferred | Per original handoff: only needed before next pipeline run (book #2 or pilot rerun). |
| 3. Word-bbox redistribution | ⏸ deferred | When admin moves `entry_bbox`, ALTO export still uses old per-word bboxes. UI is fine; only ALTO exports drift. Reuse algorithm from `pipeline/ocr.py`. |
| 4. Filter UI | ✅ shipped | Status filter (Alle/Goed/Twijfel/Open) + dots, admin-only. |
| 5. Stats dashboard | ✅ shipped | Server-side aggregation at `/admin/stats`. |

## Open issues / known gotchas

- **Bbox edit drag/resize** — verified by API + DOM presence + Konva mounted. Did NOT manually click-drag to confirm handle ergonomics. First action next session: open admin, toggle Focus + Bewerk bbox, drag/resize, confirm save flow round-trips.
- **`output/overrides/1769_19525-1926_0150.json`** — should be `{}` (cleaned up after each test). Verify before committing.
- **Bbox excludes name** (pipeline) — still pending. `pipeline/align.py`. Logged in `NEXT_STEPS.md` §7.
- **Pipeline data quality** — known low cross-references, address_full duplication, ~5% LLM errors. Per Decision 5: fix in overrides, not by re-running pipeline.
- **Public semantic filters** — original Alle/Namen/Straten/Beroepen buttons were dropped to make room for status filter. Note in `NEXT_STEPS.md` §9; restore as separate row if needed.
- **Konva on Next 16** — works via `dynamic(import, {ssr:false})`. The `'use client'` directive alone isn't enough because Konva touches `window` at module load.
- **Hook noise** — `PreToolUse:Edit` keeps printing "READ-BEFORE-EDIT REMINDER" even when the file was just read. Edits succeed regardless. Annoying but not blocking.
- **Old console errors persist in preview tool** — when checking `preview_console_logs`, you may see stale parse errors from earlier edits. Trust the actual server logs (`preview_logs`) for current state.

## Ready-to-resume checklist

- [ ] Open `/admin/page/1769_19525-1926_0150` (login `admin` / `devpass`)
- [ ] Toggle "Focus" + "Bewerk bbox"
- [ ] Drag the rect, resize via handles, click "Opslaan bbox"
- [ ] Reload — bbox should persist
- [ ] Open `/admin/stats` — verify dashboard renders
- [ ] Tick "Goed" on an entry, save, return to search panel — confirm green dot appears, "Goed" filter narrows to that entry

## What NOT to do (still applies)

- Don't mutate `output/json/`, `output/alto/`, `output/llm_raw/` — those are reproducible. Corrections go in `output/overrides/`.
- Don't switch stack from Next + Konva + Tailwind.
- Don't deploy admin publicly. Local-only or VPN/IP allowlist.
- Don't add multi-user auth.
- Don't try per-word bbox editing in admin.

## Uncommitted changes

Even more than at session start. `web/` got: BboxEditor, stats page + lib, EditForm flag UI, SearchPanel status filter + gating, Header rewrite, Viewer focus+filter wiring, ScanPanel toggles, route.ts sanitizers. `NEXT_STEPS.md` updated with semantic-filter note. `HANDOFF.md` replaced (this file).

`output/overrides/1769_19525-1926_0150.json` should be `{}` after this session's cleanup. Verify with `cat` before committing.

To commit when resuming:
```bash
cd /Users/lieuwejongsma/projects/groningen-adresboek-1926
git status
# Be selective — top-level git root is ~/, not this repo. Setting up a real
# repo for the project is still a fresh decision (don't add 1.5GB scans).
```

## To resume in fresh Claude session

Open this file and tell Claude "continue from HANDOFF.md".
