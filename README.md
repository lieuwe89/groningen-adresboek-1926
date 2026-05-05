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
├── web/                     Next.js app (public site + admin panel)
│   ├── app/                 Route handlers (Next.js App Router)
│   │   ├── page/[stem]/     Public page viewer (read-only)
│   │   ├── admin/           Admin panel (basic-auth)
│   │   │   ├── page/[stem]/ Per-page correction editor
│   │   │   └── stats/       Extraction quality stats
│   │   └── info/            About page
│   ├── components/          Shared React components
│   ├── lib/                 DB access, geocoding helpers, types
│   └── public/              Static assets (DZI tiles served from here)
├── docs/
│   └── design-ref/          UI/UX reference HTML
├── output/overrides/        Admin panel edits (tracked; all other output gitignored)
└── CLAUDE.md                Architecture notes for AI assistants
```

## Tech Stack & Architecture

### Core Framework
- **Next.js 15 (App Router)**: Orchestrates the public-facing site and the administrative backend.
- **TypeScript**: Ensures type safety across data processing and UI components.
- **TailwindCSS**: Used for the layout and responsive design system.

### Data & Storage
- **SQLite**: The primary database (`adresboek.db`), storing ~60,000 entries and their geocodes.
- **DZI (Deep Zoom Images)**: Served via `web/public/tiles/` for the high-resolution scan viewer.
- **MapLibre GL JS**: Renders the interactive map, supporting both modern vector tiles and historical raster overlays.

### Geocoding & GIS
- **PDOK Locatieserver**: Used for real-time address normalization and BAG-compliant geocoding.
- **GeoTIFF / PMTiles**: Historical maps (circa 1919–1930) are georeferenced and served as tiled layers.

### Infrastructure
- **Basic Auth**: Secures the administrative correction interface.
- **Environment Variables**: Managed via `.env.local` for sensitive configuration like passwords.

## Setup

```bash
cd web
npm install
cp .env.local.example .env.local   # set ADMIN_PASSWORD
npm run dev                         # http://localhost:3001
```

The app reads from `web/data/adresboek.db` (SQLite). Build it from the
pipeline outputs:

```bash
npm run build:db    # or: python scripts/build_db.py
```

The SQLite file is gitignored (regeneratable). See "External assets" below.

## Routes

| Route | Access | Description |
|---|---|---|
| `/` | public | Search and map overview |
| `/page/<stem>` | public | Scan viewer + extracted entries for one page |
| `/info` | public | About page / methodology |
| `/admin/page/<stem>` | basic-auth | Correction editor |
| `/admin/stats` | basic-auth | Extraction quality dashboard |

## External assets

These are not in git — obtain from the project's Drive folder or external storage:

| Path | What | Size |
|---|---|---|
| `web/data/adresboek.db` | SQLite database (entries + geocodes) | ~50 MB |
| `web/public/tiles/` | DZI tile sets for deep-zoom scan viewer | ~5 GB |
| `web/public/maps/` | Georeferenced historic map tiles | ~1 GB |
| `output/` | Pipeline outputs (hOCR, JSON, ALTO) | ~3 GB |
| `scans/` | Source JPEG page scans | ~932 MB |

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
