#!/usr/bin/env bash
# Convert each scan in web/public/scans/ to a DZI tile pyramid in
# web/public/tiles/<stem>.dzi + <stem>_files/. Idempotent: skips when
# the .dzi is newer than the source JPEG.
#
# Run: bash scripts/generate_dzi.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/web/public/scans"
DST_DIR="$ROOT/web/public/tiles"

mkdir -p "$DST_DIR"

if ! command -v vips >/dev/null 2>&1; then
  echo "vips not found. Install libvips (brew install vips)." >&2
  exit 1
fi

shopt -s nullglob
total=0
done_count=0
skip_count=0
for src in "$SRC_DIR"/*.jpg; do
  total=$((total + 1))
  base="$(basename "$src" .jpg)"
  dzi="$DST_DIR/$base.dzi"
  if [ -f "$dzi" ] && [ "$dzi" -nt "$src" ]; then
    skip_count=$((skip_count + 1))
    continue
  fi
  # vips dzsave OUT (no extension) → OUT.dzi + OUT_files/
  vips dzsave "$src" "$DST_DIR/$base" \
    --suffix '.webp[Q=82]' \
    --tile-size 256 \
    --overlap 1 \
    --layout dz
  done_count=$((done_count + 1))
  if [ $((done_count % 25)) -eq 0 ]; then
    echo "  $done_count converted ($total seen, $skip_count skipped)"
  fi
done

echo
echo "Done: $done_count converted, $skip_count skipped, $total total"
echo "Tiles in: $DST_DIR"
du -sh "$DST_DIR" 2>/dev/null || true
