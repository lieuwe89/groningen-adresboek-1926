# Groningen Adresboek 1926

A web app for exploring the 1926 Groningen address book — 60,783 entries
extracted from ~900 scanned pages, geocoded against the Dutch BAG registry,
and presented with a map and deep-zoom scan viewer.

## What's in the data

- **Name register** (119–603): residents with address and occupation
- **Street register** (604–799): streets with house numbers and occupants
- **Institutional listings** (9–118): churches, schools, associations, city services

Entries are geocoded via PDOK / BAG and linked to georeferenced historic maps.

## Repo layout

```
.
├── app/[locale]/        Route handlers (Next.js App Router, i18n nl/en)
│   ├── page/[stem]/     Public page viewer (read-only)
│   ├── login/           Cookie-session login
│   ├── admin/           Admin panel (cookie auth)
│   │   ├── page/[stem]/      Per-page correction editor
│   │   ├── house-numbers/    House number corrections
│   │   ├── missing-numbers/  Missing-number gap finder (BAG)
│   │   └── stats/            Extraction quality + BAG coverage
│   └── info/            About page (Waarom 1926, methodology)
├── components/          Shared React components
├── lib/                 DB access, geocoding helpers, types
├── public/              Static assets (DZI tiles served from here)
└── data/overrides/      Admin panel edits (tracked)
```

## Syncing edits between local and Fly

`data/overrides/*.json` is the canonical store of edits; SQLite columns
are a derived cache. Run `npm run sync` to LWW-merge local + every Fly
machine's overrides, push the result back, and rebuild every cache.
See [docs/sync-overrides.md](docs/sync-overrides.md) for details.

> [!NOTE]
> Internal documentation, design references, and architectural notes are excluded from the repository to keep the codebase focused on implementation.

## Tech Stack & Architecture

### Core Framework
- **Next.js 15 (App Router)**: Orchestrates the public-facing site and the administrative backend.
- **TypeScript**: Ensures type safety across data processing and UI components.
- **TailwindCSS**: Used for the layout and responsive design system.

### Data & Storage
- **SQLite**: The primary database (`adresboek.db`), storing ~60,000 entries and their geocodes.
- **DZI (Deep Zoom Images)**: Served via `public/tiles/` for the high-resolution scan viewer.
- **MapLibre GL JS**: Renders the interactive map, supporting both modern vector tiles and historical raster overlays.

### Geocoding & GIS
- **PDOK Locatieserver**: Used for real-time address normalization and BAG-compliant geocoding.
- **GeoTIFF / PMTiles**: Historical maps (circa 1919–1930) are georeferenced and served as tiled layers.

### Search
- **SQLite FTS5**: Full-text index over names, occupations, and addresses.
- **Fuzzy re-ranking** (v0.13.0): Optional Levenshtein-based re-ranking on top of FTS hits, toggled by a checkbox in the search sidebar — handles OCR variants and historic spelling.
- **i18n**: Dutch + English UI via `messages/{nl,en}.json` and `next-intl`.

### Infrastructure
- **Cookie session auth** (v0.11.0): HTTP-only signed cookie issued at `/login`, replacing Basic Auth so the admin works inside the `playground.lieuwejongsma.nl` proxy iframe.
- **Reverse-proxy aware**: All internal links go through `useProxyUrl().proxyPath` so the app works both at `/` and under the `/groningen-1926` proxy prefix.
- **Environment Variables**: Managed via `.env.local` for `ADMIN_PASSWORD` and the cookie signing secret.

## Setup

```bash
npm install
cp .env.local.example .env.local   # set ADMIN_PASSWORD
npm run dev                         # http://localhost:3000
```

The app reads from `data/adresboek.db` (SQLite). Build it from the
pipeline outputs:

```bash
npm run build:db    # or: python _pipeline/scripts/build_db.py
```

The SQLite file is gitignored (regeneratable). See "External assets" below.

## Routes

| Route | Access | Description |
|---|---|---|
| `/` | public | Search (FTS + optional fuzzy) and map overview |
| `/page/<stem>` | public | Scan viewer + extracted entries for one page |
| `/info` | public | About page (Waarom 1926, methodology, links) |
| `/login` | public | Cookie-session login for admin |
| `/admin` | cookie-auth | Admin landing |
| `/admin/page/<stem>` | cookie-auth | Per-page correction editor (bbox + entries) |
| `/admin/house-numbers` | cookie-auth | House number correction queue |
| `/admin/missing-numbers` | cookie-auth | Gap finder against BAG-validated streets |
| `/admin/stats` | cookie-auth | Extraction quality + BAG coverage dashboard |

All routes are also reachable via `/{nl,en}/...` for explicit locale; `next-intl` middleware handles the default redirect.

## External assets

These are not in git — obtain from the project's Drive folder or external storage:

| Path | What | Size |
|---|---|---|
| `data/adresboek.db` | SQLite database (entries + geocodes) | ~50 MB |
| `public/tiles/` | DZI tile sets for deep-zoom scan viewer | ~5 GB |
| `public/maps/` | Georeferenced historic map tiles | ~1 GB |
| `_pipeline/output/` | Pipeline outputs (hOCR, JSON, ALTO) | ~3 GB |
| `_pipeline/scans/` | Source JPEG page scans | ~932 MB |

## Pipeline

Extraction was done by a separate OCR + LLM pipeline:

→ [lieuwe89/tables-ocr-pipeline](https://github.com/lieuwe89/tables-ocr-pipeline)

The pipeline uses Surya OCR for word bounding boxes and a vision LLM (Gemini
2.5 Flash Lite via OpenRouter) for structured extraction. It outputs per-page
JSON with word-level bbox references, ALTO XML, and combined search indexes.
Full book cost was ~$7.50 in LLM API calls.

## User Onboarding & Guided Tour

To help first-time users navigate the application, we've implemented an interactive onboarding experience:
- **Welcome Modal**: Triggers on the first visit, providing a brief project overview and disclaimer. Preference is persisted in `localStorage` (`grn1926-welcome-dismissed`).
- **Interactive Tour**: Built with **Shepherd.js**, this 6-step walkthrough highlights core features:
    1.  **De Kaart**: Overview of the interactive building markers.
    2.  **Kaartlagen**: Demonstrates switching between modern and historical maps.
    3.  **Zoeken**: Automated opening of the search sidebar.
    4.  **Paginaweergave**: Automated opening of the high-res scan viewer.
    5.  **Secties**: Navigation through different parts of the address book.
    6.  **Meer Informatie**: Pointing to the detailed project methodology.

The tour uses global state via `SelectionContext` to programmatically control UI panels and menus for a seamless experience.
