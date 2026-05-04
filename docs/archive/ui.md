# UI Design: Groningen Adresboek 1926 — Interactive Explorer

## Design Philosophy

**Modern shell, historical content.** The interface is clean, dark, and minimal — the historical atmosphere comes entirely from the primary sources: the 1926 scans, the period maps, and the data itself. The UI should feel like a professional research tool that anyone can use.

## Color Palette (Dark Mode)

| Role | Color | Usage |
|------|-------|-------|
| Background | `#0f0f14` | Main app background |
| Surface | `#1a1a24` | Panels, cards |
| Surface Elevated | `#242432` | Hover states, active panels |
| Border | `#2e2e3e` | Panel edges, dividers |
| Text Primary | `#e8e6e3` | Body text, titles |
| Text Secondary | `#9694a0` | Labels, metadata |
| Accent | `#5b8af5` | Links, active states, search matches |
| Accent Warm | `#e8a84c` | Map markers, address highlights |
| Highlight Word | `#5b8af5` at 40% opacity | Word-level search match on scan |
| Highlight Entry | `#5b8af5` at 12% opacity | Entry-level highlight on scan |
| Success | `#4ade80` | Geocoding success indicators |

## Typography

- **UI**: Inter (system font stack fallback)
- **Data display** (entry details, search results): Inter
- **No serif fonts in the UI** — the historical serif typography appears naturally in the scans

---

## Layout: Full-Viewport Map with Panels

```
┌─────────────────────────────────────────────────────────┐
│ ┌─ Search Panel ─┐                                     │
│ │ 🔍 Search...   │         MAP (full viewport)         │
│ │                │                                     │
│ │ Filters        │    ┌── Historic overlay toggle ──┐  │
│ │ ○ Names        │    │ 🗺️ 1926 ●━━━━━━○ Modern    │  │
│ │ ○ Streets      │    └─────────────────────────────┘  │
│ │ ○ Occupations  │                                     │
│ │                │         📍 📍    📍                  │
│ │ ─── Results ── │       📍  📍📍  📍                   │
│ │ Balk, M.E.     │     📍     📍                       │
│ │  Praediniussi.6│            📍 📍                    │
│ │ Balk, P.       │                                     │
│ │  Van Julsinga.29            📍                       │
│ │ Balkema, J.    │                                     │
│ │  Gr. Kruisstr.24│                                    │
│ │ ...            │                                     │
│ └────────────────┘                      ┌─ Scan Panel ─┐
│                                         │ 📄 Page 136  │
│                                         │ ┌───────────┐│
│                                         │ │           ││
│                                         │ │  [scan    ││
│                                         │ │   with    ││
│                                         │ │  deep     ││
│                                         │ │  zoom]    ││
│                                         │ │           ││
│                                         │ └───────────┘│
│                                         │ ◀ 135  137 ▶ │
│                                         └──────────────┘
└─────────────────────────────────────────────────────────┘
```

### Three states of the interface:

**1. Map only (default after dismissing welcome popup)**
- Full viewport map with clustered address markers
- Search icon/bar floating top-left
- Historic overlay toggle floating bottom-left
- Zoom controls floating bottom-right

**2. Map + Search panel (after clicking search or typing)**
- Left panel slides in (~350px wide)
- Map shifts/resizes to accommodate
- Results update as you type (debounced)
- Each result shows: name, address, occupation, page number
- Clicking a result: zooms map to address + opens scan panel

**3. Map + Search panel + Scan panel (after clicking a result or map marker)**
- Right panel slides in (~450px wide)
- Shows the scan page with OpenSeadragon deep zoom
- Auto-scrolls/zooms to the relevant entry
- Word-level highlighting on matched search terms (blue overlay)
- Entry-level highlighting on the full record (subtle blue tint)
- Addresses within the scan are clickable (warm accent underline)
- Page navigation (prev/next) at bottom
- Close button to dismiss

### Mobile layout (responsive)

- Map is full viewport
- Search is a bottom sheet (slides up)
- Scan viewer is a full-screen modal
- Panels never coexist — one at a time

---

## Component Details

### Welcome Popup

Appears on first visit (dismissable, with "don't show again" option).

```
┌────────────────────────────────────────────┐
│                                            │
│   Groningen in 1926                        │
│   ─────────────────                        │
│                                            │
│   Explore the complete address book of     │
│   the city of Groningen from 1926.         │
│                                            │
│   🔍 Search by name, street, or occupation │
│   📍 Click any address to see it on the map│
│   🗺️ Toggle historic map overlays          │
│   📄 View original scanned pages           │
│                                            │
│   [NL / EN]          [Start exploring →]   │
│                                            │
└────────────────────────────────────────────┘
```

### Search Panel

- **Search input** with type-ahead suggestions
- **Filter toggles**: Names / Streets / Occupations / All
- **Results list**: scrollable, virtualized for performance
- Each result card:
  ```
  ┌──────────────────────────────┐
  │ Balk, M.E. (Mej.)          │ ← Name (bold)
  │ Verpleegster                │ ← Occupation (secondary)
  │ 📍 Praediniussingel 6      │ ← Address (accent warm)
  │ 📄 p. 136                  │ ← Page ref (small, secondary)
  └──────────────────────────────┘
  ```
- **Result count** shown at top: "247 results for 'Balk'"
- Clicking the 📍 address zooms the map
- Clicking the card opens the scan panel

### Map

- **Base layer**: Modern map (OpenStreetMap / PDOK BRT)
- **Historic overlay**: Georeferenced 1926 map(s) as raster tile layer
- **Opacity slider** for the historic overlay
- **Layer switcher** if multiple historic maps available
- **Address markers**:
  - Clustered at low zoom (circle with count)
  - Individual markers at high zoom (small dots, accent warm color)
  - On hover: tooltip with address + resident count
  - On click: popup with list of residents at that address
  
  ```
  ┌─ Praediniussingel 6 ────────┐
  │                              │
  │ • Balk, M.E. — Verpleegster │
  │                              │
  │ [View on scan →]             │
  └──────────────────────────────┘
  ```

### Scan Viewer Panel

- **OpenSeadragon** deep-zoom viewer
- **Overlay layer** on top of the scan for highlights:
  - Word-level: blue rectangles at 40% opacity on matched words
  - Entry-level: subtle blue tint behind the full entry
  - Address regions: warm accent border, cursor changes to pointer
- **Page navigation**: prev/next arrows + page number input
- **Breadcrumb**: shows section name (e.g., "Alphabetisch Naamregister")
- **Mini-map** in corner showing position within full page
- Clicking an address on the scan → map zooms to that location

### Language Switcher

- Floating in top-right corner: `NL | EN`
- All UI labels, tooltips, popup text switch instantly
- Source data (names, addresses) is NOT translated — it's historical Dutch

---

## Interaction Flows

### Flow 1: Search → Scan → Map

1. User types "Bakker" in search
2. Results panel shows all entries matching "Bakker"
3. User clicks "Bakker, H. — Broodlooper, De Hoogte 14"
4. Scan panel opens showing page with the entry highlighted
5. "De Hoogte 14" is underlined in warm accent on the scan
6. User clicks the address → map zooms to De Hoogte 14 with marker

### Flow 2: Map → Entries → Scan

1. User browses the map (possibly with 1926 overlay on)
2. Clicks a marker cluster → zooms in
3. Clicks an individual address marker at "Praediniussingel 6"
4. Popup shows: "Balk, M.E. — Verpleegster"
5. User clicks "View on scan →"
6. Scan panel opens showing the relevant page, zoomed to the entry

### Flow 3: Browse by page

1. User opens scan panel (via a "Browse pages" button or URL)
2. Navigates through pages with prev/next
3. All addresses on visible page are clickable
4. Clicking any address → map shows location

---

## Animations & Micro-interactions

- Panel slide-in/out: 300ms ease-out
- Map marker hover: scale 1.0 → 1.3 with 150ms transition
- Search results: fade-in stagger (50ms per item)
- Highlight on scan: fade-in 200ms when entry comes into view
- Overlay opacity slider: real-time update, smooth
- Page turn: crossfade 200ms between scan images
- Cluster expand: smooth zoom animation on click
