// Catalogue of available historic GeoTIFF overlays. Order is the order shown
// in the layer switcher. The bbox lat/lng comes from `gdalinfo` on each source
// file at conversion time.
//
// File layout: web/public/maps/<id>.cog.tif served as static asset.

export interface HistoricMap {
  id: string;
  label: string;
  url: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  // Approximate scan year if known — purely informational for the user.
  year?: string;
}

export const HISTORIC_MAPS: HistoricMap[] = [
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
