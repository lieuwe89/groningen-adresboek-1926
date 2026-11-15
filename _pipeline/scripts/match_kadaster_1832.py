"""Put the 1854 entries on the cadastre of 1832: which yard (erf) did the address stand on?

Present-day address (omnummer_wijkadressen.py) -> BAG address point (PDOK
Locatieserver, cached) -> the 1832 parcel under it. Writes, in the format
build_db.py reads for BAG buildings (set BUILDINGS_DIR in the book config):

  output/kadaster1832/buildings.geojson   the yards that carry entries, pand_id "hisgis-way-<id>"
  output/kadaster1832/match.json          pand_id -> entries

The BAG address point sits at the front door, a metre or two outside the yard on
the 1832 street, so a point takes the nearest yard within SNAP_M. A house number
PDOK no longer knows falls back to the BAG building with that or a neighbouring
number (demolished/merged houses).

Needs DATA_ROOT/maps/percelen_1832.geojson (HisGIS parcels, from ~/projects/Kadaster).
Run build_db.py afterwards.
"""

import csv
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from shapely import transform
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_addresses import expanded_streets  # noqa: E402
from apply_omnummering import review_key, street_rejected  # noqa: E402

from pipeline.config import DATA_ROOT, OUTPUT_DIR  # noqa: E402

CSV_PATH = OUTPUT_DIR / "omnummering" / "addresses.csv"
PARCELS = DATA_ROOT / "maps" / "percelen_1832.geojson"
BAG = OUTPUT_DIR / "bag" / "buildings.geojson"
OUT = OUTPUT_DIR / "kadaster1832"
CACHE = OUT / "pdok_cache.json"
PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"
SNAP_M = 8
# Degrees -> metres around Groningen; good to a few cm over the city.
KX, KY = 111_320 * math.cos(math.radians(53.22)), 110_574


def metres(geom):
    return transform(geom, lambda c: c * [KX, KY])


def pdok_point(street: str, number: str, cache: dict):
    key = f"{street} {number}"
    if key not in cache:
        num, letter = re.match(r"(\d+)\s*([a-z]?)", number.lower()).groups()
        url = PDOK + "?" + urllib.parse.urlencode(
            {"q": f'straatnaam:"{street}" AND huisnummer:{num}', "fq": ["type:adres", "woonplaatsnaam:Groningen"],
             "rows": 10, "fl": "weergavenaam,huisletter,centroide_ll"}, doseq=True)
        with urllib.request.urlopen(url, timeout=30) as r:
            docs = json.load(r)["response"]["docs"]
        docs.sort(key=lambda d: (d.get("huisletter", "").lower() != letter, d.get("huisletter", "")))
        cache[key] = None
        if docs:
            lng, lat = re.findall(r"[\d.]+", docs[0]["centroide_ll"])
            cache[key] = [float(lng), float(lat), docs[0]["weergavenaam"]]
        time.sleep(0.05)
    return cache[key] and cache[key][:2]


def bag_index() -> dict:
    """(street, number, letter) -> a point inside the BAG building."""
    index = {}
    for feat in json.loads(BAG.read_text(encoding="utf-8"))["features"]:
        point = None
        for a in feat["properties"]["addresses"]:
            if a.get("huisnummer") is None:
                continue
            for street in expanded_streets(a.get("openbare_ruimte")):
                key = (street, int(a["huisnummer"]), (a.get("huisletter") or "").lower())
                if key not in index:
                    point = point or shape(feat["geometry"]).representative_point()
                    index[key] = [point.x, point.y]
    return index


def bag_point(index: dict, street: str, number: str):
    num, letter = re.match(r"(\d+)\s*([a-z]?)", number.lower()).groups()
    num = int(num)
    for cand in expanded_streets(street):
        # exact, without letter, any letter, then a neighbour on the same side
        keys = [(cand, num, letter), (cand, num, "")] + [(cand, num, c) for c in "abcdefgh"] + [(cand, num + d, "") for d in (2, -2, 4, -4)]
        for key in keys:
            if key in index:
                return index[key]
    return None


def renumbered_streets(found: list) -> set:
    """Streets whose house numbers of 1899 are no longer today's.

    Grunnlink gives the house number of 1899. Quays such as Noorderhaven and Boterdiep were then numbered
    straight through (neighbouring wijk numbers got 24, 25, 26); today they have odd and even sides, so
    "25" is another house. Test: two neighbouring wijk numbers with house numbers one apart must still be
    neighbours today. On Grote Markt and Hoge der A they are (median 6-8 m), on the quays not (48-100 m).
    shortcut: a street needs two such pairs in the book to be tested, a renumbered street with fewer slips through;
    upgrade to a list of post-1899 renumberings when Grunnlink has one.
    """
    by = {(r["wijk"], int(r["number"])): (street, int(number), xy) for r, street, number, xy in found
          if r["status"] == "house" and r["number"].isdecimal() and number.isdecimal()}  # isdecimal: "54²".isdigit() is True
    gaps = {}
    for (wijk, n), (street, k, xy) in by.items():
        other = by.get((wijk, n + 1))
        if other and other[0] == street and abs(other[1] - k) == 1:
            gaps.setdefault(street, []).append(math.hypot((xy[0] - other[2][0]) * KX, (xy[1] - other[2][1]) * KY))
    out = {street for street, d in gaps.items() if len(d) >= 2 and sorted(d)[len(d) // 2] > 30}
    assert "Grote Markt" not in out, "Grote Markt is numbered straight through today as well"
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    yards = [f for f in json.loads(PARCELS.read_text(encoding="utf-8"))["features"] if f["properties"]["laag"] == "erf"]
    geoms = [metres(shape(f["geometry"]).buffer(0)) for f in yards]
    tree = STRtree(geoms)
    bag = None
    matches: dict = {}
    used: dict = {}
    stats = Counter()
    found = []
    rejected = street_rejected()
    try:
        with CSV_PATH.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["street_check"] == "differs" and review_key(row) in rejected:
                    stats["street_review_rejected"] += 1
                    continue
                if row["status"] not in ("house", "ambiguous"):
                    stats["no_house_address"] += 1
                    continue
                # "ambiguous": the old house was split up; take the first of the modern numbers
                street, number = row["modern_street"].split(" / ")[0], row["modern_number"].split(" / ")[0]
                xy = pdok_point(street, number, cache)
                if not xy:
                    bag = bag or bag_index()
                    xy = bag_point(bag, street, number)
                    stats["via_bag_building"] += bool(xy)
                if not xy:
                    stats["address_not_found"] += 1
                    continue
                found.append((row, street, number, xy))
    finally:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False))

    renumbered = renumbered_streets(found)
    for row, street, number, xy in found:
                if street in renumbered:
                    stats["street_renumbered_since_1899"] += 1
                    continue
                p = metres(Point(xy))
                i = int(tree.nearest(p))
                if geoms[i].distance(p) > SNAP_M:
                    stats["no_yard_within_%dm" % SNAP_M] += 1
                    continue
                pid = "hisgis-" + yards[i]["properties"]["osm"].replace("/", "-")
                used[pid] = yards[i]
                scan, idx = row["uid"].rsplit(":", 1)
                modern = f"{street} {number}"
                a = matches.setdefault(pid, {"addresses": {}})["addresses"].setdefault(
                    modern.lower(), {"lat": xy[1], "lng": xy[0], "entries": [], "raw": modern})
                a["entries"].append(f"{scan}:{int(idx)}")
                stats["on_map"] += 1

    assert stats["on_map"] > 1500, f"only {stats['on_map']} entries placed: wrong parcels file or PDOK down?"
    features = [{"type": "Feature", "geometry": f["geometry"],
                 "properties": {"pand_id": pid, "address_count": len(matches[pid]["addresses"]), "bouwjaar": None,
                                "sectie": f["properties"]["sectie"], "perceelnr": f["properties"]["perceelnr"], "soort": f["properties"]["soort"]}}
                for pid, f in used.items()]
    (OUT / "buildings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
    matches["_summary"] = dict(stats, renumbered_streets=sorted(renumbered))
    (OUT / "match.json").write_text(json.dumps(matches, ensure_ascii=False), encoding="utf-8")
    print(dict(stats), "on", len(features), "yards →", OUT)
    print("renumbered since 1899, no house link:", sorted(renumbered))


if __name__ == "__main__":
    main()
