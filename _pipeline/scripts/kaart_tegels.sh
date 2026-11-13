#!/bin/bash
# Fitted map scans -> one XYZ tile set (WebP with transparency).
#
#   kaart_tegels.sh <in dir> <scans dir> <out dir> <minzoom-maxzoom>
#
# <in dir>:    <name>.gcps and <name>_snede.geojson per map (kaart_ligging.py)
# <scans dir>: <name>.jpg, the images those control points refer to
# All maps in <in dir> become one mosaic; where they overlap the later name wins.
#
# 1854 book (run from the data root ~/projects/groningen-adresboek-1854):
#   kaart_tegels.sh output/minuutplan_ga scans_kaarten/ga maps/kadaster1832ga 12-20
#   kaart_tegels.sh output/stadskaart scans_kaarten    maps/tietsema1857   12-18
#
# Tiles, not a COG like the 1926 overlays: fourteen sheets as lossless COGs are well over a
# gigabyte, and plain tiles are served by Caddy without the browser decoding TIFFs.
set -euo pipefail
IN="$1"; SCANS="$2"; OUT="$3"; ZOOM="$4"

for gcps in "$IN"/*.gcps; do
  name=$(basename "$gcps" .gcps)
  echo "warp: $name"
  # shellcheck disable=SC2046  # the .gcps file holds separate -gcp arguments
  gdal_translate -q -of VRT -a_srs EPSG:28992 $(cat "$gcps") "$SCANS/$name.jpg" "$IN/$name.vrt"
  # -tps: exact through the control points. Cut on the cut line, so margins, legends and the black
  # corners of a rectified image go, and neighbouring sheets meet.
  gdalwarp -q -overwrite -t_srs EPSG:3857 -tps -r cubic \
    -cutline "$IN/${name}_snede.geojson" -crop_to_cutline -dstalpha \
    -co TILED=YES -co COMPRESS=DEFLATE -co PREDICTOR=2 \
    "$IN/$name.vrt" "$IN/$name.tif"
done

gdalbuildvrt -q -overwrite "$IN/mozaiek.vrt" "$IN"/*.tif
rm -rf "$OUT.nieuw"
gdal2tiles.py -q --xyz -z "$ZOOM" -r average --tiledriver=WEBP --webp-quality=80 \
  --exclude --webviewer=none --processes=8 "$IN/mozaiek.vrt" "$OUT.nieuw"
rm -rf "$OUT"   # swap only once the new set is complete
mv "$OUT.nieuw" "$OUT"
echo "tiles: $(find "$OUT" -name '*.webp' | wc -l), $(du -sh "$OUT" | cut -f1)"
