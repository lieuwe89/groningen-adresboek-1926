# Changelog

All notable changes to this project. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses semver-style `MAJOR.MINOR.PATCH` with a leading `0.` while the data model is still settling.

## [0.16.0] — 2026-06-28

### Added
- "Only buildings ≤ 1926" map toggle. Derives a 1926 building footprint layer from present-day BAG by filtering `oorspronkelijkBouwjaar ≤ 1926` — a survivorship proxy (buildings that stood in 1926 and survive today), no HISGIS dataset needed. 7637 of 9760 record-linked panden (78%) qualify.
- `bouwjaar` now persisted on `buildings` (schema + INSERT in `build_db.py`), surfaced through the buildings GeoJSON API (`buildingsGeoJsonCore.ts` type + property, `buildingsGeoJson.ts` SELECT) and applied as a client-side MapLibre filter on `buildings-fill`/`buildings-line` (`["<=", ["to-number", ["get","bouwjaar"], 99999], 1926]`, `to-number` fallback drops null years). Toggle in `MapPanel.tsx`/`MapView.tsx`; labels in `messages/{nl,en}.json`.

### Notes
- Caveats inherent to the survivorship approach: misses panden demolished or rebuilt after 1926, and dirty BAG years (medieval placeholders like 1050 — harmless here, still ≤ 1926).

## [0.15.0] — 2026-06-10

### Changed
- Caddy now serves `/tiles/*` and `/maps/*` straight from `/srv/data/groningen-1926/` with immutable cache headers — map pan/zoom tile bursts no longer hit the Node container. Fallback proxy wrapped in `handle`; `encode zstd gzip` replaces gzip-only.
- `listSections()` and `listStems()` results are memoized (DB-file inode+mtime / JSON-dir inode+mtime keys, same pattern as the buildings GeoJSON cache). The `/api/sections` health check no longer runs its GROUP BY every 30s.
- Read DB handle gets `mmap_size = 128 MB` and a 16 MB page cache.
- shepherd.js is dynamically imported when the tour starts instead of shipping in the main client bundle; its base CSS moved to the locale layout (before `shepherd-theme.css`, which overrides it).

### Removed
- `.github/workflows/fly-deploy.yml` — Fly app is destroyed, VPS is canonical. `fly.toml` stays for now because `scripts/sync-overrides.mjs` still reads it.

## [0.14.2] — 2026-05-24

### Changed
- Static prompt registry at `_pipeline/pipeline/prompts/__init__.py`. `PROMPT_FILES` dict maps section keys to template filenames; `pipeline.llm` imports + validates at module load so a missing/renamed template fails at import instead of dispatch. Closes the codebase-graph "island" around the prompt files (they used to be loaded purely by dynamic string lookup).
- Admin route protection contract at `lib/adminRouteContract.ts`. `middleware.ts` and `app/[locale]/login/page.tsx` now import `ADMIN_PROTECTED_PATTERNS`, `ADMIN_BYPASS_PREFIXES`, `ADMIN_LOGIN_API_PATH` from this single source instead of duplicating regex/strings. `isAdminRoute()` refactored to iterate the contract; semantics identical.
- JSDoc cross-refs added to every admin `page.tsx` + the admin layout pointing to `middleware.ts` and the contract, so editors discover the auth gate without grep.
- `lib/admin-session.ts` gained a header docstring describing the cookie/HMAC contract and its consumers, plus a re-export of `ADMIN_LOGIN_API_PATH` for convenience.

## [0.13.0] — 2026-05-14

### Added
- Fuzzy search with Levenshtein re-ranking on top of SQLite FTS5 hits, toggled by a checkbox in the search sidebar. Helps surface OCR variants and historic spellings that exact FTS misses.

## [0.12.0] — 2026-05

### Added
- Info page: "Waarom 1926?" section explaining the choice of year, plus contextual links and a footer that surfaces the running app version.

## [0.11.7] — 2026-05

### Fixed
- Layer switcher now lists historic map layers oldest-to-newest so the chronology reads naturally.

## [0.11.6] — 2026-05

### Fixed
- Admin "Statistieken" link uses `proxyPath` so it resolves correctly when the app is served under the `playground.lieuwejongsma.nl/groningen-1926` proxy prefix.

## [0.11.5] — 2026-05

### Changed
- `/admin/missing-numbers` now restricts the street list to BAG-validated streets, eliminating noise from unverified entries.

## [0.11.4] — 2026-05

### Fixed
- `DigitsFilter` extracted into its own client component to satisfy React 19's stricter RSC serialization rules.

## [0.11.3] — 2026-05

### Fixed
- Admin route detection moved from `usePathname` to a layout-scoped React context — `usePathname` is unreliable under the playground proxy.

## [0.11.2] — 2026-05

### Fixed
- Header `isAdmin` flag now derived from `window.location` so it survives the proxy rewrite.

## [0.11.1] — 2026-05

### Fixed
- Cookie auth made proxy-aware (path/domain attributes); dropped a probe round-trip that was confusing the iframe.

## [0.11.0] — 2026-05

### Changed
- **Replaced Basic Auth with a signed cookie session** for the admin panel. Basic Auth's 401 dialog was being suppressed by Chrome inside the cross-origin `playground.lieuwejongsma.nl` iframe, which manifested as "login disappears + reappears empty". A standard `/login` form + HTTP-only cookie sidesteps the iframe restriction.

## [0.10.0] — 2026-04

### Added
- Unlinked-bbox selection in the per-page admin editor: pick a region with no linked entry and resolve it inline.
- "Skip" button in the admin queue for entries that aren't worth correcting.
- Override-data plumbing so manual edits round-trip through the JSON override store.

## [0.9.0] — 2026-04

### Added
- BAG coverage section on the stats dashboard.
- New `/admin/missing-numbers` tool to find gaps in house-number coverage per street.

---

For history before v0.9.0 see the git log (`git log v0.8.7`).
