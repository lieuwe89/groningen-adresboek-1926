# Changelog

All notable changes to this project. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses semver-style `MAJOR.MINOR.PATCH` with a leading `0.` while the data model is still settling.

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
