#!/bin/bash
# Cadastral plans of 1832 -> one XYZ tile set (WebP with transparency) for the 1854 map.
#
# Input:  output/minuutplan/<sheet>.gcps and <sheet>_snede.geojson (minuutplan_ligging.py)
#         and the scans themselves (public domain, RCE; fetched by ~/projects/Kadaster).
# Output: maps/minuutplan1832/{z}/{x}/{y}.webp under the book's data root.
#
# Tiles, not a COG like the 1926 overlays: thirteen sheets as lossless COGs are ~1.4 GB,
# and plain tiles are served by Caddy without the browser decoding TIFFs.
set -euo pipefail

DATA_ROOT="${DATA_ROOT:-$HOME/projects/groningen-adresboek-1854}"
SCANS="${SCANS:-$HOME/projects/Kadaster/rce_scans}"
IN="$DATA_ROOT/output/minuutplan"
OUT="$DATA_ROOT/maps/minuutplan1832"
ZOOM="${ZOOM:-12-20}"  # z20 = 9 cm per pixel here; the 1:1250 sheets are scanned at 11 cm

for gcps in "$IN"/*.gcps; do
  sheet=$(basename "$gcps" .gcps)
  echo "warp: $sheet"
  # shellcheck disable=SC2046  # the .gcps file holds separate -gcp arguments
  gdal_translate -q -of VRT -a_srs EPSG:28992 $(cat "$gcps") "$SCANS/$sheet.jpg" "$IN/$sheet.vrt"
  # -tps: exact through the control points, whether the fit is affine or (D 1) a homography. Cut on the
  # parcels drawn on the sheet, so margins and legends go and neighbouring sheets meet.
  gdalwarp -q -overwrite -t_srs EPSG:3857 -tps -r cubic \
    -cutline "$IN/${sheet}_snede.geojson" -crop_to_cutline -dstalpha \
    -co TILED=YES -co COMPRESS=DEFLATE -co PREDICTOR=2 \
    "$IN/$sheet.vrt" "$IN/$sheet.tif"
done

gdalbuildvrt -q -overwrite "$IN/mozaiek.vrt" "$IN"/MIN*.tif
rm -rf "$OUT"
gdal2tiles.py -q --xyz -z "$ZOOM" -r average --tiledriver=WEBP --webp-quality=80 \
  --exclude --webviewer=none --processes=8 "$IN/mozaiek.vrt" "$OUT"
echo "tiles: $(find "$OUT" -name '*.webp' | wc -l), $(du -sh "$OUT" | cut -f1)"
