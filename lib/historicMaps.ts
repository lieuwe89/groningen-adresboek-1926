// Catalogue of available historic GeoTIFF overlays. Order is the order shown
// in the layer switcher. The bbox lat/lng comes from `gdalinfo` on each source
// file at conversion time.
//
// File layout: web/public/maps/<id>.cog.tif served as static asset.

export interface Raster {
  url: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  /** `url` is an XYZ tile template instead of a COG. */
  xyz?: { minzoom: number; maxzoom: number };
  /** Map zoom range in which the raster is drawn; always when absent. */
  show?: [number, number];
}

export interface HistoricMap extends Raster {
  id: string;
  label: string;
  // Approximate scan year if known — purely informational for the user.
  year?: string;
  /** Shown when the map opens. */
  default?: boolean;
  /** A second raster drawn on top, e.g. detailed plans that take over when zoomed in. */
  over?: Raster;
}

import { BOOK } from "./book";

const MAPS_1926: HistoricMap[] = [
  {
    id: "1536_1237",
    label: "Pharus, circa 1916",
    url: "/maps/1536_1237.cog.tif",
    bbox: [6.5187, 53.1776, 6.6235, 53.2470],
  },
  {
    id: "1536_6133",
    label: "Heeringa, circa 1919",
    url: "/maps/1536_6133.cog.tif",
    bbox: [6.5352, 53.1969, 6.5909, 53.2368],
  },
  {
    id: "1536_1698",
    label: "Edzes, circa 1920",
    url: "/maps/1536_1698.cog.tif",
    bbox: [6.5285, 53.1827, 6.6035, 53.2399],
  },
  {
    id: "0817_00950",
    label: "Bouma, circa 1922",
    url: "/maps/0817_00950-1_0001.cog.tif",
    bbox: [6.5328, 53.1874, 6.5959, 53.2405],
  },
  {
    id: "1536_1554",
    label: "VVV, circa 1930",
    url: "/maps/1536_1554.cog.tif",
    bbox: [6.5430, 53.2023, 6.5824, 53.2321],
  },
  {
    id: "1536_6138",
    label: "Darmer, 1935",
    url: "/maps/1536_6138.cog.tif",
    bbox: [6.4890, 53.1767, 6.6359, 53.2521],
  },
];

// 1854. Tiles made by _pipeline/scripts/annotatie_tegels.py (city map) and
// minuutplan_ligging.py + minuutplan_tegels.sh (cadastral plans), over the HisGIS parcels (BOOK.vectorBase).
const TIETSEMA_1857: Raster = {
  url: "/maps/tietsema1857/{z}/{x}/{y}.webp",
  xyz: { minzoom: 12, maxzoom: 18 },
  bbox: [6.5353, 53.2026, 6.5903, 53.2368],
};
const MINUUTPLANS_1832: Raster = {
  // A new tile set gets a new directory: tiles are cached for a day, and old and new sheets must not mix.
  url: "/maps/kadaster1832ga/{z}/{x}/{y}.webp",
  xyz: { minzoom: 12, maxzoom: 20 },
  bbox: [6.5125, 53.1933, 6.6021, 53.2433],
};
// From this zoom a house is a few millimetres wide and the cadastral plans become readable;
// below it they are a pale sheet and the printed city map reads better.
const DETAIL_FROM = 16.5;
const MAPS_1854: HistoricMap[] = [
  {
    id: "stad-en-kadaster",
    label: "Beide, wisselt bij inzoomen", // not "Plattegrond 1857, ...": that read as a duplicate of the layer below
    ...TIETSEMA_1857,
    show: [0, DETAIL_FROM],
    over: { ...MINUUTPLANS_1832, show: [DETAIL_FROM, 24] },
    default: true,
  },
  { id: "tietsema1857", label: "Plattegrond 1857 (Tietsema)", ...TIETSEMA_1857 },
  { id: "minuutplan1832", label: "Kadaster 1832 (minuutplans)", ...MINUUTPLANS_1832 },
];

export const HISTORIC_MAPS: HistoricMap[] = BOOK.id === "1926" ? MAPS_1926 : BOOK.id === "1854" ? MAPS_1854 : [];
