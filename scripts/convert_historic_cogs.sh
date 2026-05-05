#!/usr/bin/env bash
# Convert raw historic GeoTIFFs in Maps/GeoTIFF/ to JPEG-compressed COGs in
# web/public/maps/. Idempotent: skips files that already exist with a newer
# mtime than the source.
#
# Run: bash scripts/convert_historic_cogs.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/Maps/GeoTIFF"
DST_DIR="$ROOT/web/public/maps"

mkdir -p "$DST_DIR"

if ! command -v gdalwarp >/dev/null 2>&1; then
  echo "gdalwarp not found. Install GDAL (brew install gdal)." >&2
  exit 1
fi

shopt -s nullglob
for src in "$SRC_DIR"/*.tif; do
  base="$(basename "$src" .tif)"
  dst="$DST_DIR/$base.cog.tif"
  if [ -f "$dst" ] && [ "$dst" -nt "$src" ]; then
    echo "skip (up to date): $base"
    continue
  fi
  # LZW is lossless and has better support for alpha channels in geotiff.js.
  # Reproject to EPSG:3857 (Web Mercator) as the protocol handler assumes it.
  # We let gdalwarp determine the optimal resolution to avoid over/under-scaling.
  gdalwarp -of COG \
    -t_srs EPSG:3857 \
    -co COMPRESS=LZW \
    -co BLOCKSIZE=512 \
    -co OVERVIEW_RESAMPLING=AVERAGE \
    "$src" "$dst"
done

echo
echo "Output:"
ls -lh "$DST_DIR"/*.cog.tif 2>/dev/null | awk '{print "  ",$5,$NF}'
