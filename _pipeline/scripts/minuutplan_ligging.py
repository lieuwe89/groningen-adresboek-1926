"""Where does each cadastral plan of 1832 (minuutplan scan) lie? Ground control points + cut line per sheet.

The scans, the HisGIS parcels and the fitting code live in ~/projects/Kadaster; this script
repeats the fit of extractie/huizen_1832.py (parcel boundaries correlated on the ink, then an
affine fit through the per-tile shifts) and writes what GDAL needs, per sheet:

  <out>/<sheet>.gcps           "-gcp px line X Y ..." (full-resolution scan pixels -> RD, EPSG:28992)
  <out>/<sheet>.json           the same map as a 3x3 matrix
  <out>/<sheet>_snede.geojson  the parcels drawn on this sheet (WGS84), a few metres wider;
                               rewritten for all fitted sheets on every run (also with no sheet named)

Run with the Kadaster environment, then minuutplan_tegels.sh:

  cd ~/projects/Kadaster/extractie
  PYTHONPATH=. .venv/bin/python <this file> <out> MIN01014A01 MIN01014A02 ...
"""
import csv
import json
from collections import Counter
import os
import sys

import cv2
import numpy as np
from shapely.geometry import MultiPolygon, shape
from shapely.ops import unary_union

import huizen_1832 as h
import masks
from georef_omtrek import DATA, ROOT, apply_h

F = h.F  # the fit works on the scan at 1/F


def to_px(g, M):
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    px = [[apply_h(M, np.array(h.TO_RD.transform(*np.array(ring).T)).T) for ring in poly] for poly in polys]
    return MultiPolygon([(poly[0], poly[1:]) for poly in px]).buffer(0)


def sheet(obj: str, out: str) -> None:
    r = next(x for x in csv.DictReader(open(ROOT + "rce_kadaster_1832.csv")) if x["objectnummer"] == obj)
    full = h.scan(r)
    starts = {"ga": h.ga_matrix(r, cv2.resize(full, None, fx=1 / 4, fy=1 / 4, interpolation=cv2.INTER_AREA)) @ np.diag([F, F, 1.0])}
    if os.path.exists(f"{DATA}{obj}_georef_omtrek.json"):
        starts["omtrek"] = np.array(json.load(open(f"{DATA}{obj}_georef_omtrek.json"))["orig_to_rd"]) @ np.diag([F, F, 1.0])
    hh, w = cv2.resize(full, None, fx=1 / F, fy=1 / F, interpolation=cv2.INTER_AREA).shape[:2]
    ink = cv2.resize(masks.layers(full, faint=True)["ink"].astype(np.uint8), (w, hh), interpolation=cv2.INTER_AREA) > 0
    del full
    ink = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 2)
    feats = [f for f in json.load(open(h.UIT + "percelen_1832.geojson"))["features"] if f["properties"]["sectie"] == r["sectie"]]

    def attempt(name):
        rs = [q for f in feats for q in h.ringen(to_px(f["geometry"], np.linalg.inv(starts[name])))]
        A, row = h.globaal(rs, ink)
        A2, row2 = h.globaal([apply_h(A, q) for q in rs], ink)
        if row2["score_grof"] > row["score_grof"]:
            A, row = A2 @ A, row2
        return row["score_grof"], name, A

    score, name, A = max(attempt(n) for n in starts)
    M = starts[name] @ np.linalg.inv(A)  # work pixels -> RD
    rest = None
    for _ in range(2):
        P = [g for g in (to_px(f["geometry"], np.linalg.inv(M)) for f in feats) if not g.is_empty and 0 <= g.centroid.x < w and 0 <= g.centroid.y < hh]
        v = h.per_tegel([q for g in P for q in h.ringen(g)], ink)
        good = v[v[:, 4] >= h.MIN_SCORE]
        T = cv2.estimateAffine2D(np.float32(good[:, :2]), np.float32(good[:, :2] + good[:, 2:4]), method=cv2.RANSAC, ransacReprojThreshold=8)[0] if len(good) >= 6 else None
        if T is None:
            break
        M = M @ np.linalg.inv(np.r_[T, [[0, 0, 1]]])
    mpx = float(np.sqrt(abs(np.linalg.det(M[:2, :2]))))

    gcps = []
    # A grid, not corners: on some sheets the best start is a homography (D 1), so the map is not affine
    # and gdalwarp gets a thin plate spline through these points.
    for y in np.linspace(0, hh, 6):
        for x in np.linspace(0, w, 6):
            X, Y = apply_h(M, np.array([[x, y]]))[0]
            gcps += ["-gcp", f"{x * F:.1f}", f"{y * F:.1f}", f"{X:.3f}", f"{Y:.3f}"]
    open(f"{out}/{obj}.gcps", "w").write(" ".join(gcps))
    json.dump({"px_to_rd": (M @ np.diag([1 / F, 1 / F, 1.0])).tolist()}, open(f"{out}/{obj}.json", "w"))  # full-resolution pixels

    print(json.dumps({"blad": obj, "start": name, "score": round(float(score), 3), "m_per_px": round(mpx, 4),
                      "percelen_sectie": len(feats)}), flush=True)


def cuts(out: str) -> None:
    """Cut line per sheet: the parcels whose boundaries are drawn on it.

    A section can span several sheets, and a sheet has margins, a title and blank paper where
    the neighbouring sheet continues. So ask the scan: a parcel belongs to the sheet where ink
    lies under its boundary. (The sheet outline of RCE/Allmaps is too rough for this: on A 2 it
    leaves out a row of parcels along the dike.)
    """
    K, REACH_M, DRAWN = 4, 2.5, 0.5  # scan at 1/K; boundary may lie this far from the ink; share of boundary on ink
    feats = json.load(open(h.UIT + "percelen_1832.geojson"))["features"]
    rings = {}  # per parcel: boundary points every ~2 m, in RD
    for i, f in enumerate(feats):
        g = shape(f["geometry"]).buffer(0)
        if g.is_empty:
            continue
        b = g.boundary
        pts = [b.interpolate(d, normalized=True) for d in np.linspace(0, 1, max(8, int(g.length * 60_000 / 2)), endpoint=False)]
        rings[i] = (g, np.array(h.TO_RD.transform([q.x for q in pts], [q.y for q in pts])).T)
    best = {}  # parcel -> (score, sheet)
    for path in sorted(f for f in os.listdir(out) if f.endswith(".gcps")):
        obj = path[:-5]
        M = np.array(json.load(open(f"{out}/{obj}.json"))["px_to_rd"])
        Minv = np.linalg.inv(M)
        mpx = np.sqrt(abs(np.linalg.det(M[:2, :2])))
        grey = cv2.resize(cv2.imread(f"{ROOT}rce_scans/{obj}.jpg", cv2.IMREAD_GRAYSCALE), None, fx=1 / K, fy=1 / K, interpolation=cv2.INTER_AREA)
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
    # A section drawn on a single sheet needs no test: whatever HisGIS has of it is on that sheet. This keeps
    # the moat and the ramparts, whose long washed outlines carry too little ink to pass.
    n_sheets = Counter(x["objectnummer"][:9] for x in csv.DictReader(open(ROOT + "rce_kadaster_1832.csv")))
    for obj in sorted(f[:-5] for f in os.listdir(out) if f.endswith(".gcps")):
        mine = [rings[i][0] for i in rings if feats[i]["properties"]["sectie"] == obj[8]
                and (n_sheets[obj[:9]] == 1 or (best.get(i, (0, None))[1] == obj and best[i][0] >= DRAWN))]
        cut = unary_union(mine).buffer(0.00003).buffer(0)  # ~3 m, so neighbouring sheets meet
        json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": cut.__geo_interface__}]},
                  open(f"{out}/{obj}_snede.geojson", "w"))
        print(obj, "parcels on this sheet:", len(mine), flush=True)


if __name__ == "__main__":
    os.makedirs(sys.argv[1], exist_ok=True)
    for o in sys.argv[2:]:
        sheet(o, sys.argv[1])
    cuts(sys.argv[1])  # always, over every sheet fitted so far
