# Handoff: Admin CRM + Website Build

**Status:** planning complete, no code written yet. Pick up from here on the new PC.

This document captures the plan agreed during the planning conversation on 2026-05-02. It supersedes the relevant parts of [website_plan.md](website_plan.md) (specifically: the website should be built with editing capabilities baked in, not as a read-only frontend with a separate admin tool).

---

## 1. Why this exists

The pipeline pilot on the 1926 Groningen address book is complete (838 pages, 60,783 entries — see [handoff.md](handoff.md)). Spot-checking via the local testing viewer ([viewer.py](viewer.py) → [viewer/index.html](viewer/index.html)) shows two recurring quality issues:

1. **Text errors** in some entries (LLM mistakes — wrong name, wrong address, missed entries, misread occupation).
2. **Wrong bounding boxes** — sometimes wildly off. Per the user, this will look sloppy and confusing in the public website's UI/UX, so it must be fixable.

The pipeline is "good enough" automation; the CRM is the human-in-the-loop correction layer that gets us from ~95% to publishable quality.

## 2. Key decisions (locked in)

These were debated and decided. Don't reopen unless something forces it:

1. **Single-app architecture.** Build the public website and the admin CRM as **one Next.js app**. Editing is "the same UI with edit-mode turned on behind auth at `/admin/*`". The CRM is not a separate tool — it's the website's admin mode. Most "CRM" UI work is foundation the public site needs anyway.

2. **Single user.** Only the project owner edits. No multi-user accounts, no conflict handling, no role system. **Basic auth via Next.js middleware** with a single env-var password is enough.

3. **Bbox corrections must propagate to ALTO XML.** Not just the website display layer. Strategy: admin draws a new entry-level rectangle; on ALTO export, redistribute the entry's words proportionally by character width inside that rectangle (split by original line membership first if multi-line). Reuses the algorithm already in [pipeline/ocr.py](pipeline/ocr.py) for the rounded-equal-bbox repair (constraint #11 in [CLAUDE.md](CLAUDE.md)).

4. **Per-entry single rectangle**, not per-word bbox editing. Per-word editing is far more work and the public site only displays entry-level highlights anyway. Word boxes inside an overridden entry rect are auto-derived via redistribution.

5. **Overrides as separate JSONL/JSON files**, not mutating generated output. Generated `output/json/` and `output/alto/` stay reproducible from the pipeline; corrections live in `output/overrides/<stem>.json` and are merged at read time.

6. **Stack:**
   - Next.js 15 (App Router) + TypeScript
   - react-konva for the bbox canvas (do not write raw `<canvas>` — Konva saves ~3 days)
   - Tailwind for forms (5 different section schemas, lots of forms)
   - SQLite + FTS5 for search (already planned in [website_plan.md](website_plan.md))
   - OpenSeadragon for deep-zoom is in the website plan; **decision pending** whether to use it for the admin canvas too or use react-konva over a plain rendered scan. See §8.

## 3. Critical prerequisite: stable entry IDs

The whole CRM hinges on this: when you correct an entry today and the pipeline re-runs tomorrow (better prompts, fallback model on a flagged page), corrections must reattach to the same entry. If entry order shifts, overrides orphan.

**Scheme:**
- Primary key: `<stem>:<entry_index>` (e.g. `0003_000138_0156:14`).
- Sidecar fingerprint: SHA1 of `(normalized_name, normalized_address, normalized_occupation)` stored alongside each override.
- On pipeline re-run: a reconciliation pass compares each override's fingerprint to the new entry at that index. If match → keep. If mismatch but fingerprint matches a different index on the same page → migrate. If no match anywhere on the page → flag as `orphaned` for manual review (don't silently drop).

Estimate: ~1 day to design + implement reconciliation, including the migration script and the orphan report.

## 4. Override schema

`output/overrides/<stem>.json` per page. Atomic writes (write to `<stem>.json.tmp` then rename).

```jsonc
{
  "<stem>:<entry_index>": {
    "fields": {
      // Partial — only changed fields. Same shape as entry in output/json/<stem>.json.
      "name": "...",
      "address_full": "...",
      "occupation_expanded": "..."
    },
    "bbox": {
      "type": "rect",                  // "rect" for now; "polygon" reserved for future
      "value": [x1, y1, x2, y2],
      "source": "manual"
    },
    "flags": {
      "verified": true,
      "needs_review": false,
      "bbox_unreliable": false         // suppresses highlight if true; for cases where no good box exists
    },
    "fingerprint": "sha1:abc123...",
    "edited_at": "2026-05-02T14:23:01Z",
    "edit_history": [                  // append-only, optional
      { "ts": "...", "diff": { /* changed fields */ } }
    ]
  }
}
```

**Merge semantics at read time:**
- Start with generated entry from `output/json/<stem>.json`.
- Shallow-merge `overrides[id].fields` over it.
- If `bbox` present in override → use it as the entry rect; redistribute word bboxes inside it for ALTO/per-word display.
- `flags.bbox_unreliable` → website suppresses the highlight overlay for that entry.

## 5. ALTO write-back

Wire overrides into [pipeline/alto_export.py](pipeline/alto_export.py) and [pipeline/json_export.py](pipeline/json_export.py):

1. When loading a page's entries for export, merge overrides.
2. For each entry with a manual bbox override:
   - Identify the entry's words (via existing `word_ids` on the entry).
   - Group words by their original line (from OCR cache).
   - For each line group, redistribute word bboxes proportionally by character count inside the corresponding horizontal slice of the new entry rect.
   - Reuse the redistribution function from [pipeline/ocr.py](pipeline/ocr.py) (factor it out into a shared helper if not already).
3. ALTO output uses the redistributed per-word boxes; entry-level rect goes in the `<TextBlock>` HPOS/VPOS/WIDTH/HEIGHT.

**Known limitation to flag in code comments:** if the admin's redrawn box is far from where the actual ink sits on the scan, ALTO becomes "fictional" — the per-word boxes look reasonable but don't sit on the original glyphs. Acceptable trade-off because (a) ALTO is for archival display, not OCR ground truth, and (b) admin should only redraw when the existing box is genuinely wrong.

## 6. Build plan (sized)

### Foundation (needed for the public website regardless)

| Task | Days | File reference |
|---|---|---|
| Next.js 15 + TS + Tailwind scaffold | 0.5 | new repo |
| Public page route: scan + bbox overlay + entry list, read-only | 2 | `app/[locale]/page/[stem]/page.tsx` |
| Per-section page templates (5 types: name, street, occupation, institutional, generic) | 2 | `components/sections/*` |
| Combined index pages (search, address, street) | 1.5 | `app/[locale]/{search,address,street}/page.tsx` |
| Pipeline integration: overrides merge in JSON read path + ALTO export | 1.5 | [pipeline/json_export.py](pipeline/json_export.py), [pipeline/alto_export.py](pipeline/alto_export.py) |
| **Foundation subtotal** | **~7.5d** | |

### CRM-specific delta

| Task | Days | File reference |
|---|---|---|
| Stable entry IDs + reconciliation script | 1 | `pipeline/reconcile_overrides.py` (new) |
| Basic auth middleware on `/admin/*` | 0.25 | `middleware.ts` |
| Edit-mode toggle + dirty state + save flow | 0.5 | `components/admin/EditMode.tsx` |
| Per-section edit forms (5 schemas) | 1.5 | `components/admin/forms/*` |
| Konva canvas: select/move/resize/draw/zoom/undo | 5 | `components/admin/BboxEditor.tsx` |
| Two-way sync (click box ↔ select entry) | 0.5 | shared state in `BboxEditor` |
| Workflow: filters, mark-verified, keyboard shortcuts | 1.5 | `components/admin/PageNavigator.tsx` |
| Stats dashboard (% verified, error rate per section) | 0.5 | `app/[locale]/admin/page.tsx` |
| **CRM delta subtotal** | **~10.5d** | |

**Total: ~18 days focused work, ~4 weeks calendar at relaxed pace.**

### Suggested order

1. **Week 1 — Foundation slice (5d):** Next scaffold; one section template; page route renders scan + bboxes + entries from existing JSON in `output/json/`. End-of-week milestone: a strict upgrade over the current testing viewer.
2. **Week 2 — Vertical slice of editing (3d):** auth middleware; save endpoint at `POST /api/admin/page/[stem]/entry/[id]`; Konva with one rectangle you can drag/resize; write to `output/overrides/`; reload reflects the change. **Decision gate:** if this feels right, commit to the rest. If Konva fights or ergonomics are bad, reconsider here — only 8 days spent.
3. **Week 3 — Forms + canvas polish (7d):** per-section forms; dirty/save; remaining 4 templates; zoom/pan; draw-new; undo; keyboard nudge.
4. **Week 4 — Workflow + integration (3d):** filters, verified flags, ALTO write-back wiring, combined index regen, reconciliation, stats.

### Scrappy MVP fallback

If full plan feels too big, a usable MVP is **~7–8 days**: text editing + draw-one-rectangle bbox replacement, no zoom, no undo, no per-section forms (one generic form), no reconciliation (accept that re-runs blow away overrides for now). Ship this first if uncertain, expand later.

## 7. API routes (admin-only)

All under `/api/admin/*`, gated by basic auth middleware:

- `GET  /api/admin/pages` — list pages with status counts (verified, flagged, unreviewed).
- `GET  /api/admin/page/[stem]` — merged page JSON (generated + overrides).
- `PATCH /api/admin/page/[stem]/entry/[id]` — partial update, atomic write to override file.
- `POST /api/admin/page/[stem]/verify` — mark whole page verified.
- `GET  /api/admin/stats` — for dashboard.

Public routes (`/api/search`, `/api/page/[stem]`, etc.) per [website_plan.md §API Routes](website_plan.md) read the same merged JSON, so overrides flow through transparently.

## 8. Open questions for the new session

1. **OpenSeadragon vs react-konva for the admin canvas.** [website_plan.md](website_plan.md) uses OpenSeadragon for the public deep-zoom viewer. For the admin canvas you need draggable handles with selection — Konva's strength. Two options:
   - **(a)** Use OpenSeadragon everywhere; do edit handles via OSD's SVG overlay layer. Pro: one viewer, consistent zoom/pan UX. Con: OSD's overlay layer is not designed for interactive shapes; you'd be fighting it.
   - **(b)** Use OpenSeadragon for the public site, react-konva (with a plain `<img>` background) for the admin canvas. Pro: each tool used for what it's good at. Con: two viewers, slightly different zoom UX between modes.
   - **Recommendation: (b).** The admin uses the canvas for ~minutes per page; public visitors use the deep-zoom for browsing. Different jobs.

2. **DZI tile generation timing.** [website_plan.md](website_plan.md) calls for `vips dzsave` over all 838 scans to produce ~2 GB of tiles. This is a one-time prerequisite for OpenSeadragon on the public site. Does the admin need DZI too? If using react-konva with a plain `<img>` (option 8.1.b), no — admin can serve the original JPEGs from `scans/` directly. **Recommendation: skip DZI for admin, do it only for public deployment.**

3. **Where does the SQLite import happen relative to overrides?** Two orderings:
   - Import generated JSON → SQLite once, then layer overrides on top at API read time (slow, every request merges).
   - Re-import to SQLite after every override save (fast reads, write amplification on save).
   - **Recommendation: middle ground** — overrides in JSON files for editing, import to SQLite as a build step before deploy. Admin runs against JSON (simpler, slower), public runs against SQLite (fast). A `npm run build:db` script regenerates SQLite from `output/json/` + `output/overrides/`.

4. **Repo structure.** Keep the website in this repo (new `web/` subdirectory) or a sibling repo (`groningen-adresboek-1926-web`)? [website_plan.md](website_plan.md) implies a sibling. Argument for same repo: overrides live in `output/overrides/` next to the pipeline that produces what they override; a single git history captures both. **Recommendation: same repo, `web/` subdir.**

## 9. What the new session should do first

1. Read this file, [website_plan.md](website_plan.md), [ui.md](ui.md), [handoff.md](handoff.md), and [CLAUDE.md](CLAUDE.md) (in that order).
2. Resolve the four open questions in §8 with the user before any code.
3. Look at [viewer/index.html](viewer/index.html) to understand what the current testing viewer does — the public page route should be a strict superset.
4. Sample 2–3 entries from `output/json/` of different section types to confirm the field shapes assumed in §4 match reality. The schema differs by section (name register vs street register vs occupation), and the per-section forms in §6 depend on these shapes.
5. **Then** start the foundation slice (week 1 of §6).

## 10. Things the new session should NOT do without checking

- Don't mutate `output/json/`, `output/alto/`, `output/llm_raw/`, or any pipeline output. Those are reproducible from the pipeline; overrides go in `output/overrides/`.
- Don't pick a different stack (e.g. SvelteKit, raw `<canvas>`) without re-discussing — the Next + Konva + Tailwind choice is locked.
- Don't add multi-user auth, OAuth, or a database for the editing layer. Single user, env-var password, JSON files on disk.
- Don't try to make bbox editing work at the per-word level. Entry-level rect only; words redistribute.
- Don't deploy the admin to Fly.io exposed publicly. Admin is local-only or behind VPN/IP allowlist; only the read-only public site goes to Fly.

## 11. Reference

- Pipeline pilot completion: [handoff.md](handoff.md)
- Website plan (mostly still valid, but read this doc's §1–2 first for the framing change): [website_plan.md](website_plan.md)
- UI/UX design: [ui.md](ui.md)
- Project conventions: [CLAUDE.md](CLAUDE.md)
- Current testing viewer (to be superseded): [viewer.py](viewer.py), [viewer/index.html](viewer/index.html)
- Pipeline outputs the CRM reads: `output/json/`, `output/alto/`, `output/combined/`
- Where overrides will be written: `output/overrides/` (does not exist yet)
