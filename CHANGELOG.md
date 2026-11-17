# Changelog

All notable changes to this project. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses semver-style `MAJOR.MINOR.PATCH` with a leading `0.` while the data model is still settling.

## [0.28.1] — 2026-11-17

### Changed
- Both books: phones open on the map instead of the search panel (owner decision). A link to one entry still opens on the scan.

## [0.28.0] — 2026-11-17

### Added
- Both books: a phone layout below 768px. One panel at a time, with a bar at the bottom for Search, Map and Scan; a chosen result or a mention in the building card brings the scan to the front. The text blocks are scaled up 1.3x, the header folds into two rows, and the map cards on the info page stack. Wider screens are unchanged: every visible element on the main page and the info page keeps its position, size and type at 1280x800, in both books.

### Changed
- Phones no longer show "works best on a larger screen" in the welcome window, nor the admin button, the coordinates and the footer (the footer stays on the info page).
- The tour popup stays within the screen on narrow displays.

## [0.27.0] — 2026-11-16

### Added
- 1854: Grunnlink v0.42 gives the parcel of 1832 for wijk A to S (was T only), from the population registers of 1830/1840 and the owner tables. 163 more entries go on the map through it, quays included. On the 434 exact links that also have such a parcel, 350 lie on the same or the adjoining yard and 50 further than 10 m, so these entries stay approximate.

### Changed
- 1854: an exact link through today's address goes before Grunnlink's parcel; the parcel fills in where today's address gives no exact yard. Before, the parcel went first, which with parcels for all wijken would have turned hundreds of exact links into approximations.

## [0.26.0] — 2026-11-16

### Added
- 1854: unlinked entries between two wijk numbers that Grunnlink places, also numbers the book never prints, go on the nearer neighbour's yard as an approximation (R. Weeshuisstraatje A 39 between A 37 and A 40). The neighbours lie at most 3 numbers away, their yards within 15 m, and Grunnlink puts one of them in the street the book prints. 53 entries; hold-out on the exact links: 39 of 697 further than 10 m.
- 1854: an unlinked entry goes to the yard of the same person (surname and first initial) placed elsewhere in the book in the same street, as an approximation. 7 entries, mostly a misread digit (H 30/50, F 280/180, P 97/79).
- An entry on the map without an address of today shows "pand verdwenen, geen huidig adres".

### Changed
- 1854: the street review no longer decides anything (owner decision): its verdicts were not backed by sources. Where the book prints another street than Grunnlink, Grunnlink's street counts, as it did for streets nobody reviewed. 30 entries gain today's address.
- 1854: neither new rule touches an entry where the book and Grunnlink give different streets (Martini Kerkhof C 117: the book against the Omnummerboek's Schuitendiep). Two sources disagree there; it stays unlinked until a third settles it.

## [0.25.1] — 2026-11-16

### Changed
- 1854: where Grunnlink gives other houses than when a street in the street review was judged, the review no longer rejects Grunnlink's street; Grunnlink's current answer counts (owner decision). Five entries gain today's address: Stoeldraaijerstraat O 215 (Boterdiep) and Buiten Heerepoort Z 51/72/73 (Hereweg); Z 51 goes on the map at Hereweg 21.

## [0.25.0] — 2026-11-16

### Added
- 1854: a wijk number for which Grunnlink gives the parcel of the 1832 cadastre itself (`parcel1832`, from the population registers of 1830/1840 matched to the owner tables) goes straight to that parcel, as an approximation. 25 entries in wijk T, a wijk renumbered in 1878 where the detour through today's address fails.
- 1854: the owner tables of 1832 (OAT), transcribed from the RCE scans, as a check on the links. Where the only namesake in the street owns the linked yard the link is confirmed; where he owns the yard next door the entry moves there as an approximation; an unlinked entry is placed on the one yard in its street whose owner has its surname and first initial, for surnames that own at most eight yards in town. The tables record ownership, not use, so nothing rests on them as exact. Skipped when `output/oat/oat_groningen.csv` is absent.

### Changed
- 1854: the quay conversion takes the side from Grunnlink (`side`, "noordzijde") instead of deriving it from the wijk, and converts only within the range of house numbers it was fitted on.
- `omnummer_wijkadressen.py` writes `side`, `parcel1832` and `parcel_certainty` to `addresses.csv`.

## [0.24.3] — 2026-11-15

### Fixed
- Clicking a house on the map could give a 404. Browsers kept the list of houses (`/api/buildings`) for a day, plus a week of stale use, and after a database rebuild that list held house ids that no longer exist. The list now carries an ETag and is revalidated on every load (a cheap 304 when nothing changed), so a rebuild on the server reaches visitors at once. The map also adds the release version to the URL, so browsers that still hold the old list drop it.

## [0.24.2] — 2026-11-15

### Fixed
- 1854: the parcels of 1832 lay about 5 m west and 2 m south of the modern map. HisGIS itself is off by that much in the inner city (measured against the facades of BAG buildings from before 1900 in 25 squares of 250 m; after the shift the median deviation per square is about 1 m). The parcels, the cadastral plans and the 1857 city map all move 5.0 m east and 1.75 m north; the A-kerk outline comes from the BAG and stays put. New tile directories (`kadaster1832ga-v2`, `tietsema1857-v2`), so no browser mixes old and new tiles.
- 1854: entries re-linked to the shifted yards. 95% of the exactly placed address points now fall inside a yard (was 74%), yards with three or more wijk numbers went from 39 to 30, and 2,269 entries are on the map (was 2,276: 12 lost their yard within 8 m, 5 gained one).

## [0.24.1] — 2026-11-15

### Fixed
- 1854: returning visitors kept the old parcel file for a day after it was replaced, so the churches of 0.23.0 did not show; a hard reload did not help, because the map fetches the file from a worker. The URL of the file now carries the release version.

## [0.24.0] — 2026-11-15

### Added
- 1854: more entries on the 1832 map, placed as an approximation. Where the parcel number runs along with the wijk number (wijk K 191-195 on parcels K 236-240), the parcel follows from the number (`parcel_run`); an unlinked wijk number next to a linked one goes on the neighbour's yard (`interpolate`). Both are tested against the exactly placed numbers at every run; the outcome is in `match.json` under `_summary.holdout`.

### Changed
- 1854: an entry whose address point of today falls on a church, a bare yard, a garden or a bleaching field of 1832 is no longer placed there: it goes to the parcel its wijk number points at, else to the nearest premises within 8 m, as an approximation. Warehouses, stables and workshops keep their entries; the book is a trade directory.
- 1854: a yard that collects three or more wijk numbers (moved street lines, one modern building) is no longer shown as exact; its entries are approximate.
- The yard panel says "Ligging bij benadering: dit erf of een erf vlakbij".

### Fixed
- 1854: the present-day address of entries on the seven quay streets showed the house number of 1899. It now shows today's number with a "±" where it could be converted, and the street alone elsewhere.

## [0.23.0] — 2026-11-15

### Added
- 1854: churches and public buildings stand out on the map. 101 parcels of 1832 with a public use (kerk, raadhuis, hospitaal, waag, wachthuis, koornmolen and the like) are drawn in rose with the kind the cadastre gives them, shown when zoomed in. Martinikerk, A-kerk and Nieuwe Kerk, each one parcel with its churchyard, get an outline of their own and a name from the overview on (two from HisGIS, the A-kerk from the BAG). The parcels were in the file all along, but without an entry in the book they were beige on beige.

## [0.22.0] — 2026-11-15

### Added
- 1854: entries on four quay sides (Noorderhaven N.Z., Damsterdiep N.Z. and Z.Z., Schuitendiep O.Z. from nr 44) are placed on the 1832 map again, as an approximation. Each quay side had its own house numbers 1..N in 1899; `match_kadaster_1832.py` converts them to today's odd/even number per side. The yard panel says "Ligging bij benadering: dit erf of het erf ernaast" for these entries (`geocode_type = 'approx'`).

## [0.21.4] — 2026-11-15

### Fixed
- `og:type` is `website` again, not `article`; the `article:*` tags are gone. `author` and `publish_date` stay.

## [0.21.3] — 2026-11-15

### Added
- Link previews carry an author and a publish date (`author`, `publish_date`, `article:published_time`).

## [0.21.2] — 2026-11-15

### Changed
- Both books have a description of more than 100 characters; LinkedIn asks for that length in link previews.

## [0.21.1] — 2026-11-15

### Added
- Link previews: both books send `og:image` (a 1200×630 screenshot of the site), `og:title` and `og:description`, so LinkedIn and other sites show a card.

### Fixed
- 1854: the building card follows the selected person.

## [0.21.0] — 2026-11-14

### Added
- 1854: a modern map layer, "Modern (OpenStreetMap)", under Kaartlagen. It covers the same area as the HisGIS parcels of 1832 and is cut off at that edge.

## [0.20.4] — 2026-11-13

### Changed
- 1854 opens with only the parcels and the yards with entries. The city map of 1857 and the cadastral plans of 1832 load when a visitor picks them under Kaartlagen.

## [0.20.3] — 2026-11-13

### Added
- The info pages of the two books point to each other: 1854 to groningen-1926.lieuwejongsma.nl and 1926 to groningen-1854.lieuwejongsma.nl, in Dutch and English.

## [0.20.2] — 2026-11-13

### Changed
- 1854: all cadastral sheets now come from the Groninger Archieven. A 1, B 1 and D 2 are fitted on the original scans (the image bank holds them next to its rectified images), so the RCE scans are no longer needed and D 2 lies within a metre of the parcels instead of eleven.
- 1854: the layer that switches from the 1857 map to the cadastre is now called "Beide, wisselt bij inzoomen"; its old name read as a second "Plattegrond 1857".

### Fixed
- `kaart_ligging.py` stopped after two rounds of tile fitting, before a strongly skewed sheet (D 2) had settled; it now goes on until the fit stands still.

## [0.20.1] — 2026-11-13

### Changed
- 1854: the cadastral plans are now the Groninger Archieven's own copies (toegang 44): cleaner sheets, a little sharper in the inner city, and sheet D 2 is there. Sheets A 1 and B 1 stay with the RCE scans, because the archive's rectified images of those are bent and cannot be fitted on the parcels.

## [0.20.0] — 2026-11-13

### Added
- 1854: W. Tietsema's city map of 1857 (Groninger Archieven) as the overview. Zoomed out the map shows it, zoomed in the cadastral plans of 1832 take over; both are also available as layers of their own.
- A historic layer can carry a second raster with its own zoom range (`over` and `show` in `lib/historicMaps.ts`).
- Pipeline: `kaart_ligging.py` fits a rectified image-bank map on the HisGIS parcels (the bank's own placement was 18 m off in the centre for the 1857 map); `kaart_tegels.sh` tiles any set of fitted maps.

### Changed
- 1854: outlines of yards with entries thin out on the overview.

## [0.19.0] — 2026-11-12

### Changed
- 1854: the map now shows the cadastral plans of 1832 themselves (thirteen scanned sheets from the Cultural Heritage Agency, public domain) as a tile layer over the HisGIS parcels, on by default. The house outlines traced from those scans are gone: too many houses were missing and the edges were ragged.
- 1854: yards with entries are outlined in Prussian blue and drawn heavier, so they stand out against the red and pink of the plans.
- Historic map layers can be XYZ tile sets as well as COGs, and one can be marked as shown by default (`lib/historicMaps.ts`).

### Added
- Pipeline: `minuutplan_ligging.py` (where each sheet lies, which parcels are drawn on it) and `minuutplan_tegels.sh` (GDAL: warp, cut, mosaic, WebP tiles).

## [0.18.0] — 2026-11-12

### Added
- **A second address book from the same codebase: the trade directory of 1854.** `NEXT_PUBLIC_BOOK` picks the book at build time (`lib/book.ts`); each book has its own image, data volume, texts (`messages/books/`), theme (`html[data-book]`) and favicon. Deployed at `groningen-1854.lieuwejongsma.nl`.
- 1854: ward addresses (wijk letter + number) are converted to present-day addresses with Grunnlink; cards and panels show both.
- 1854: the map is the cadastre of 1832 (HisGIS parcels, house outlines from the cadastral plans) and entries are placed on its yards.
- Pipeline: per-book configuration (`ADRESBOEK_BOOK`, `_pipeline/books/`), scans and word boxes straight from an archive PDF.

### Changed
- Palette colours in components are theme tokens instead of hex literals, so a book theme can re-value them. No visible change for 1926.
- The deploy workflow builds one image per book.

## [0.17.3] — 2026-09-16

### Changed
- Info page: "Why are many addresses not on the map?" now gives real numbers (26% of entries with an address still unlinked: ~8,300 unknown house numbers, ~2,000 not located, ~700 in vanished streets, ~200 without a number) and credits GrunnLink for the street-name translation table. Street-name-change bullet updated to match.
- Copy pass: em dashes in UI labels, page title and info text replaced by colons or split sentences; stiffer phrasing simplified; "de Groninger Archieven".

## [0.17.2] — 2026-09-16

### Changed
- Back to the Carto `dark_nolabels` basemap, now with a free Carto basemaps API key (referrer-restricted), replacing the Esri stopgap from 0.17.1.

## [0.17.1] — 2026-09-16

### Fixed
- Map basemap showed a tiled "API KEY REQUIRED" watermark: Carto now watermarks keyless `basemaps.cartocdn.com` tiles. Switched to Esri World Dark Gray Base (keyless), dimmed with `raster-brightness-max` to keep the dark look.

## [0.17.0] — 2026-09-16

### Added
- Historical street renames from Grunnlink in the BAG matcher (`HISTORICAL_RENAMES` in `match_addresses.py`), e.g. Coehoornstraat→Geulstraat, Zuiderbinnensingel→Coehoornsingel, Hoornsche dijk→Paterswoldseweg.
- `apply_bag_matches.py`: add (or, with `unlink`, remove) building links in a live DB without a rebuild.

### Data
- Prod: +4,726 entries linked to a BAG building, +890 buildings on the map (426 via renames, the rest from a match run that was stale since the May street normalisation).
- Prod, second pass: 30 Houtstraat links removed (vanished street, not Houtzagersstraat); Hoornsche dijk moved from today's Hoornsedijk to Paterswoldseweg (+235 links). Totals: 32,836 linked entries, 10,737 buildings.

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
