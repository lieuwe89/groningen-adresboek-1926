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
