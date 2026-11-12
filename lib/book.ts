// One codebase, one deployment per address book. NEXT_PUBLIC_BOOK picks the book
// at build time (it is inlined into the client bundle), so every book gets its
// own image/build; data comes from DB_PATH / JSON_DIR as before.
//
// Texts:  messages/books/<id>.<locale>.json override messages/<locale>.json.
// Theme:  html[data-book="<id>"] in app/globals.css re-values the colour tokens.

export interface Book {
  id: string;
  year: number;
  title: string; // <title>
  description: string;
  favicon: string;
  startStem: string; // page the home route opens
  adminStartStem: string;
  /** Show the "only buildings built ≤ year" toggle (BAG bouwjaar is unreliable before ~1900). */
  builtBeforeFilter: boolean;
  /** Carto raster basemap id. */
  basemap: "dark_nolabels" | "light_nolabels";
  /** Building footprint colour on the map (maplibre paint cannot read CSS variables). */
  mapAccent: string;
  /** Period vector base (GeoJSON under /maps) drawn instead of the Carto raster; null = Carto. */
  vectorBase: { parcels: string; houses: string; attribution: string } | null;
  /** Header "Blad" value; null hides it. */
  sheetLabel: string | null;
}

const BOOKS: Record<string, Book> = {
  "1926": {
    id: "1926",
    year: 1926,
    title: "Adresboek 1926: Gemeente Groningen",
    description: "Interactieve verkenner van het Groninger adresboek 1926",
    favicon: "/favicon.png",
    startStem: "1769_19525-1926_0121", // first page of the Naamregister
    adminStartStem: "1769_19525-1926_0150",
    builtBeforeFilter: true,
    basemap: "dark_nolabels",
    mapAccent: "#e8b84c",
    vectorBase: null,
    sheetLabel: "A-Z",
  },
  "1854": {
    id: "1854",
    year: 1854,
    title: "Adresboek 1854: Fabrijkanten, kooplieden en winkeliers te Groningen",
    description: "Interactieve verkenner van het Groninger adresboek of naam-register van 1854",
    favicon: "/favicon-1854.png",
    startStem: "1769_19527-1854_0007", // first page of the register (Aannemers)
    adminStartStem: "1769_19527-1854_0007",
    builtBeforeFilter: false,
    basemap: "light_nolabels",
    mapAccent: "#8f2a23",
    // Cadastre of 1832, the nearest survey before 1854 (made in ~/projects/Kadaster).
    vectorBase: {
      parcels: "/maps/percelen_1832.geojson",
      houses: "/maps/huizen_1832.geojson",
      attribution:
        'Kadaster 1832: percelen &copy; <a href="https://hisgis.nl">HisGIS</a> (ODbL), huizen uit de minuutplans (RCE)',
    },
    sheetLabel: null,
  },
};

export const BOOK: Book = BOOKS[process.env.NEXT_PUBLIC_BOOK ?? "1926"] ?? BOOKS["1926"];
