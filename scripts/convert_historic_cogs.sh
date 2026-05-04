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

if ! command -v gdal_translate >/dev/null 2>&1; then
  echo "gdal_translate not found. Install GDAL (brew install gdal)." >&2
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
  echo "converting: $base"
  # JPEG compression is lossy but fine for scanned historic maps.
  # PHOTOMETRIC=YCBCR + COMPRESS=JPEG halves size again on 3-band imagery.
  gdal_translate -of COG \
    -co COMPRESS=JPEG \
    -co QUALITY=80 \
    -co BLOCKSIZE=512 \
    -co OVERVIEW_RESAMPLING=AVERAGE \
    "$src" "$dst"
done

echo
echo "Output:"
ls -lh "$DST_DIR"/*.cog.tif 2>/dev/null | awk '{print "  ",$5,$NF}'
