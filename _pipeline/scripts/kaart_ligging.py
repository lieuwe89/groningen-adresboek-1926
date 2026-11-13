"""Lay maps from the Groninger Archieven image bank on the HisGIS parcels of 1832, better than the bank's own georeference.

The image bank (beeldbankgroningen.nl) serves its georeferenced maps already rectified: a
north-up image in degrees, placed by its corners. That placement is tens of metres off in the
inner city. This script fits each image on HisGIS: parcel boundaries are correlated with the
ink of the map, first the whole sheet (scale, rotation, shift), then per tile, and an affine
map goes through the tile shifts. The fitting functions are those of ~/projects/Kadaster
(extractie/huizen_1832.py); run with that project's environment.

  kaart_ligging.py minuutplans <out> MIN01014A01=<image id> ...   cadastral plans of 1832, one per sheet
  kaart_ligging.py stadskaart <out> tietsema1857=<image id>       a city map: only streets and water are matched

Input:  <scans>/<name>.jpg  the image at full resolution (Kadaster/extractie/fetch_scan.py <image id> <file>),
        scans = <out>/../../scans_kaarten/{ga,} (see SCANS); the annotation of ~/projects/GroningenMaps.
Output, per map, what kaart_tegels.sh needs:
  <out>/<name>.gcps           "-gcp px line X Y ..." (image pixels -> RD, EPSG:28992)
  <out>/<name>.json           the same map as a 3x3 matrix
  <out>/<name>_snede.geojson  cut line (WGS84). Cadastral plans: the parcels drawn on the sheet, rewritten for
                              all fitted sheets on every run. City map: the sheet itself.
"""
import json
import os
import re
import sys
from collections import Counter

import cv2
import numpy as np
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import unary_union

import huizen_1832 as h
import masks
from georef_omtrek import apply_h

ANNOTATIONS = os.path.expanduser("~/projects/GroningenMaps/explorer/dist/annotations/")
PARCELS = h.UIT + "percelen_1832.geojson"


def annotation(image_id: str):
    """(image pixels -> RD as 3x3, mask polygon in image pixels) from the image bank's georeference."""
    a = json.load(open(f"{ANNOTATIONS}{image_id}.json"))
    item = a["items"][0] if "items" in a else a
    px = np.array([f["properties"]["resourceCoords"] for f in item["body"]["features"]], float)
    rd = np.array([h.TO_RD.transform(*f["geometry"]["coordinates"]) for f in item["body"]["features"]])
    A = np.linalg.lstsq(np.c_[px, np.ones(len(px))], rd, rcond=None)[0]
    mask = [tuple(map(float, p.split(","))) for p in re.search(r'points="([^"]+)"', item["target"]["selector"]["value"]).group(1).split()]
    return np.r_[A.T, [[0, 0, 1]]], Polygon(mask)


def to_px(g, M):
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    px = [[apply_h(M, np.array(h.TO_RD.transform(*np.array(ring).T)).T) for ring in poly] for poly in polys]
    return MultiPolygon([(poly[0], poly[1:]) for poly in px]).buffer(0)


def fit(image: str, G0: np.ndarray, feats: list, mpx: float) -> tuple:
    """Image pixels -> RD, fitted on the boundaries of `feats`. Returns (matrix, report)."""
    full = cv2.imread(image)
    H0, W0 = full.shape[:2]
    # The fitting functions expect square pixels of ~0.2 m (1:1250) or ~0.43 m (1:2500); the image has
    # pixels of equal degrees. So work on a copy resampled to an RD grid. Ink is looked for at twice
    # the working resolution: the faint 1-pixel lines do not survive shrinking the scan first.
    c = apply_h(G0, np.array([[0, 0], [W0, 0], [W0, H0], [0, H0]], float))
    x0, y1 = c[:, 0].min(), c[:, 1].max()
    w, hh = int((c[:, 0].max() - x0) / mpx), int((y1 - c[:, 1].min()) / mpx)
    R = np.array([[mpx, 0, x0], [0, -mpx, y1], [0, 0, 1]])  # working pixels -> RD, as the image bank has it
    fine = cv2.warpAffine(full, (np.diag([2, 2, 1.0]) @ np.linalg.inv(R) @ G0)[:2], (2 * w, 2 * hh), flags=cv2.INTER_AREA)
    del full
    # A rectified image has black corners around the sheet; they are not ink (nor is the sheet's edge against them).
    sheet = cv2.erode((fine.max(axis=2) > 12).astype(np.uint8), np.ones((41, 41), np.uint8))
    ink = cv2.resize((masks.layers(fine, faint=True)["ink"] > 0).astype(np.uint8) & sheet, (w, hh), interpolation=cv2.INTER_AREA) > 0
    del fine
    ink = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 2)

    def rings(M):
        P = (to_px(f["geometry"], np.linalg.inv(M)) for f in feats)
        return [q for g in P if not g.is_empty and 0 <= g.centroid.x < w and 0 <= g.centroid.y < hh for q in h.ringen(g)]

    A, row = h.globaal(rings(R), ink)
    A2, row2 = h.globaal([apply_h(A, q) for q in rings(R)], ink)  # second round from the first: start outside the grid
    if row2["score_grof"] > row["score_grof"]:
        A, row = A2 @ A, row2
    M = R @ np.linalg.inv(A)
    for _ in range(2):  # the tiles see what scale and rotation cannot: skew and uneven shrinkage of the paper
        v = h.per_tegel(rings(M), ink)
        good = v[v[:, 4] >= h.MIN_SCORE]
        T = cv2.estimateAffine2D(np.float32(good[:, :2]), np.float32(good[:, :2] + good[:, 2:4]), method=cv2.RANSAC, ransacReprojThreshold=8)[0] if len(good) >= 6 else None
        if T is None:
            break
        M = M @ np.linalg.inv(np.r_[T, [[0, 0, 1]]])
    v = h.per_tegel(rings(M), ink)
    good = v[v[:, 4] >= h.MIN_SCORE]
    centre = np.array([[w / 2, hh / 2]])
    moved = float(np.hypot(*(apply_h(M, centre) - apply_h(R, centre))[0]))  # how far the fit moved the image bank's placement
    report = {"score": round(float(row["score_grof"]), 3), "tiles_good": f"{len(good)}/{len(v)}",
              "rest_m_median": round(float(np.median(np.hypot(good[:, 2], good[:, 3])) * mpx), 1) if len(good) else None,
              "moved_m_at_centre": round(moved, 1)}
    return M @ np.linalg.inv(R) @ G0, report, (W0, H0)


def write(out: str, name: str, P: np.ndarray, size: tuple) -> None:
    W0, H0 = size
    gcps = []
    for y in np.linspace(0, H0, 6):
        for x in np.linspace(0, W0, 6):
            X, Y = apply_h(P, np.array([[x, y]]))[0]
            gcps += ["-gcp", f"{x:.1f}", f"{y:.1f}", f"{X:.3f}", f"{Y:.3f}"]
    open(f"{out}/{name}.gcps", "w").write(" ".join(gcps))
    json.dump({"px_to_rd": P.tolist()}, open(f"{out}/{name}.json", "w"))


def geojson(path: str, geom) -> None:
    json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": geom.__geo_interface__}]}, open(path, "w"))


def cuts(out: str, scans: str) -> None:
    """Cut line per cadastral sheet: the parcels whose boundaries are drawn on it.

    A section can span several sheets, and a sheet has margins, a title and blank paper where
    the neighbouring sheet continues. So ask the scan: a parcel belongs to the sheet where ink
    lies under its boundary. (Sheet outlines are too rough for this: on A 2 the outline leaves
    out a row of parcels along the dike.)
    """
    K, REACH_M, DRAWN = 4, 2.5, 0.5  # scan at 1/K; boundary may lie this far from the ink; share of boundary on ink
    feats = json.load(open(PARCELS))["features"]
    rings = {}  # per parcel: boundary points every ~2 m, in RD
    for i, f in enumerate(feats):
        g = shape(f["geometry"]).buffer(0)
        if g.is_empty:
            continue
        b = g.boundary
        pts = [b.interpolate(d, normalized=True) for d in np.linspace(0, 1, max(8, int(g.length * 60_000 / 2)), endpoint=False)]
        rings[i] = (g, np.array(h.TO_RD.transform([q.x for q in pts], [q.y for q in pts])).T)
    sheets = sorted(f[:-5] for f in os.listdir(out) if f.endswith(".gcps"))
    best = {}  # parcel -> (score, sheet)
    for obj in sheets:
        M = np.array(json.load(open(f"{out}/{obj}.json"))["px_to_rd"])
        Minv = np.linalg.inv(M)
        mpx = np.sqrt(abs(np.linalg.det(M[:2, :2])))
        grey = cv2.resize(cv2.imread(f"{scans}/{obj}.jpg", cv2.IMREAD_GRAYSCALE), None, fx=1 / K, fy=1 / K, interpolation=cv2.INTER_AREA)
        ink = ((cv2.blur(grey, (31, 31)).astype(np.int16) - grey) > 18).astype(np.uint8)  # darker than the paper around it
        r = int(np.ceil(REACH_M / (mpx * K)))
        ink = cv2.dilate(ink, np.ones((2 * r + 1, 2 * r + 1), np.uint8))
        hh, w = ink.shape
        for i, f in enumerate(feats):
            if i not in rings or f["properties"]["sectie"] != obj[8]:  # MIN01014<section><sheet>
                continue
            px = np.round(apply_h(Minv, rings[i][1]) / K).astype(int)
            ok = (px[:, 0] >= 0) & (px[:, 0] < w) & (px[:, 1] >= 0) & (px[:, 1] < hh)
            score = float(ink[px[ok, 1], px[ok, 0]].sum()) / len(px)
            if score > best.get(i, (0, None))[0]:
                best[i] = (score, obj)
    scores = np.array([s for s, _ in best.values()])
    print("share of each parcel boundary on ink, histogram 0..1:", np.histogram(scores, bins=10, range=(0, 1))[0].tolist(),
          "| parcels never on a sheet:", len(feats) - len(best), flush=True)
    # A section on a single sheet needs no test: whatever HisGIS has of it is on that sheet. This keeps the
    # moat and the ramparts, whose long washed outlines carry too little ink to pass. (Counted over the sheets
    # fitted here: fit all sheets of a section, or its leftovers land on the wrong sheet.)
    n_sheets = Counter(o[:9] for o in sheets)
    for obj in sheets:
        mine = [rings[i][0] for i in rings if feats[i]["properties"]["sectie"] == obj[8]
                and (n_sheets[obj[:9]] == 1 or (best.get(i, (0, None))[1] == obj and best[i][0] >= DRAWN))]
        geojson(f"{out}/{obj}_snede.geojson", unary_union(mine).buffer(0.00003).buffer(0))  # ~3 m wider, so sheets meet
        print(obj, "parcels on this sheet:", len(mine), flush=True)


if __name__ == "__main__":
    kind, out, maps = sys.argv[1], sys.argv[2], dict(m.split("=") for m in sys.argv[3:])
    os.makedirs(out, exist_ok=True)
    scans = os.path.normpath(f"{out}/../../scans_kaarten") + ("/ga" if kind == "minuutplans" else "")
    parcels = json.load(open(PARCELS))["features"]
    for name, image_id in maps.items():
        G0, mask = annotation(image_id)
        native = np.sqrt(abs(np.linalg.det(G0[:2, :2])))
        if kind == "minuutplans":
            feats, mpx = [f for f in parcels if f["properties"]["sectie"] == name[8]], 0.2 if native < 0.12 else 0.43
        else:
            feats, mpx = [f for f in parcels if f["properties"]["laag"] in ("straat", "water")], 0.4
        P, report, size = fit(f"{scans}/{name}.jpg", G0, feats, mpx)
        write(out, name, P, size)
        if kind != "minuutplans":  # the sheet itself, as the image bank outlines it
            ll = np.array(h.TO_WGS.transform(*apply_h(P, np.array(mask.exterior.coords)).T)).T
            geojson(f"{out}/{name}_snede.geojson", Polygon(ll))
        print(json.dumps({"map": name, "native_m_per_px": round(float(native), 3), **report}), flush=True)
    if kind == "minuutplans":
        cuts(out, scans)
