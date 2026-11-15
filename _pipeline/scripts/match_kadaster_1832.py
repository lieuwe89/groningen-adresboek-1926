"""Put the 1854 entries on the cadastre of 1832: which yard (erf) did the address stand on?

Present-day address (omnummer_wijkadressen.py) -> BAG address point (PDOK
Locatieserver, cached) -> the 1832 parcel under it. Writes, in the format
build_db.py reads for BAG buildings (set BUILDINGS_DIR in the book config):

  output/kadaster1832/buildings.geojson   the yards that carry entries, pand_id "hisgis-way-<id>"
  output/kadaster1832/match.json          pand_id -> entries

The BAG address point sits at the front door, a metre or two outside the yard on
the 1832 street, so a point takes the nearest yard within SNAP_M. A house number
PDOK no longer knows falls back to the BAG building with that or a neighbouring
number (demolished/merged houses). Five groups are placed to a nearby yard only and carry
"approx": true: entries on a quay side in QUAY_SIDES; wijk numbers in a stretch where the
parcel number runs along with the wijk number (parcel_run); entries on a yard where PILE or
more wijk numbers come together; entries whose point falls on a parcel without premises
(NO_PREMISES); and unlinked wijk numbers next to a linked one (interpolate). For the quay streets the script also corrects address_modern in
the page JSONs: apply_omnummering.py wrote the house number of 1899 there as today's.

Needs DATA_ROOT/maps/percelen_1832.geojson (HisGIS parcels, from ~/projects/Kadaster).
Run build_db.py afterwards.
"""

import bisect
import csv
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from shapely import transform
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_addresses import expanded_streets  # noqa: E402
from apply_omnummering import review_key, street_rejected  # noqa: E402
from omnummer_wijkadressen import same_street  # noqa: E402

from pipeline.config import DATA_ROOT, JSON_DIR, OUTPUT_DIR  # noqa: E402

CSV_PATH = OUTPUT_DIR / "omnummering" / "addresses.csv"
PARCELS = DATA_ROOT / "maps" / "percelen_1832.geojson"
BAG = OUTPUT_DIR / "bag" / "buildings.geojson"
OUT = OUTPUT_DIR / "kadaster1832"
CACHE = OUT / "pdok_cache.json"
PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"
SNAP_M = 8
# Degrees -> metres around Groningen; good to a few cm over the city.
KX, KY = 111_320 * math.cos(math.radians(53.22)), 110_574


# Quay sides whose house number of 1899 converts to today's. In 1899 each side of a quay had its own series
# 1..N (Omnummerboek, GA 1700 nr 25: "Noorderhaven (N/Z/)" 1-28, "(Z/Z/)" 1-35); today one side is even, the
# other odd. (Grunnlink street, wijk) -> c, with today's number = 2 * number of 1899 + c.
# Fitted 2026-11-15 on corner houses: a wijk number that also has an address in a side street, found today
# within 12 m of the quay. Every check on the same wijk number is at most one house off, so the yard is
# "this one or the next": the entry is placed as approximate.
# Left out, the street stays unlinked there: Noorderhaven Z.Z. (wijk I), Boterdiep O.Z., Schuitendiep W.Z.,
# Spilsluizen, Lopendediep (no or one check) and Boterdiep W.Z. (checks up to two houses off).
# Schuitendiep O.Z. 1-43 of 1899 is not today's Schuitendiep: those numbers come out below 1 and are skipped.
QUAY_SIDES = {("Noorderhaven", "L"): 1, ("Damsterdiep", "Q"): -3, ("Damsterdiep", "P"): -2,
              ("Schuitendiep", "O"): -86, ("Schuitendiep", "P"): -86}


def quay_number_today(street: str, wijk: str, number: str) -> str | None:
    c = QUAY_SIDES.get((street, wijk))
    k = re.fullmatch(r"(\d+)[a-z]?", number)  # not "20/4": a dwelling in the alley behind 20, not on the quay
    today = c is not None and k and 2 * int(k.group(1)) + c
    return str(today) if today and today > 0 else None


# Today's address point can lie on a parcel of 1832 where nobody had premises: Oude Kijk in 't Jatstraat 19 falls
# on the church parcel K 98. Such an entry is not placed by its point. The book is a trade directory (owner,
# 2026-11-15), so warehouses, stables, workshops and yards of a trade count as premises; only churches, bare
# yards, bleaching fields and gardens do not.
NO_PREMISES = re.compile(r"^(kerk|kerkhof|erf|plaats|tuin|bleek|bleek als weiland)$")  # not "erf en schuur"
RUN_W, RUN_MIN, RUN_SHARE = 6, 3, 0.6
# Where the street line moved or houses merged (north side of the Grote Markt, one modern building on Gedempte
# Kattendiep), today's points of several houses land on one yard of 1832: nine wijk numbers on parcel H 283. A
# yard that collects PILE or more wijk numbers this way is not house-accurate. Its entries are no anchors and
# are approximate; parcel_run may still give them their own parcel (it can for few: 7 of 144 numbers, 2026-11-15).
PILE = 3
GAP, NEAR_M = 3, 15


def wijk_number(row: dict) -> int | None:
    m = re.match(r"\d+", row["number"])
    return int(m.group()) if m else None


def interpolate(rows: list, placed: set, exact: dict, streets: dict, geoms: list) -> list:
    """Unlinked entries whose wijk number lies next to a linked one: [(row, yard index)].

    The book's own wijk numbers run along the street, so number n stands on or beside the yard of n-1 or n+1.
    Rule: the same number is linked through another entry; or a linked number is 1 away, a linked number lies
    within GAP on the other side and their two yards are within NEAR_M (within GAP on both sides is enough when
    both are the same yard). And the book prints the same street for the entry as for one of those neighbours:
    a misread number sits in another street.
    holdout() measures this on the linked numbers themselves at every run; main() prints the outcome.
    """
    numbers = defaultdict(list)
    for w, n in exact:
        numbers[w].append(n)
    out = []
    for row in rows:
        w, n = row["wijk"], wijk_number(row)
        if row["uid"] in placed or n is None or w not in numbers:
            continue
        ns = sorted(numbers[w])
        j = bisect.bisect_left(ns, n)
        if j < len(ns) and ns[j] == n:
            near, i = [n], exact[(w, n)]
        elif 0 < j < len(ns) and n - ns[j - 1] <= GAP and ns[j] - n <= GAP:
            lo, hi = ns[j - 1], ns[j]
            a, b = exact[(w, lo)], exact[(w, hi)]
            if a != b and (min(n - lo, hi - n) > 1 or geoms[a].distance(geoms[b]) > NEAR_M):
                continue
            near, i = [lo, hi], a if n - lo <= hi - n else b
        else:
            continue
        if any(same_street(row["book_street"], s) for k in near for s in streets[(w, k)]):
            out.append((row, i))
    return out


def parcel_run(rows: list, placed: set, exact: dict, parcel: list, yard: dict) -> list:
    """Unlinked entries in a stretch where the parcel number runs along with the wijk number: [(row, yard index)].

    Wijk numbers (1822) and parcel numbers (1832) both count the houses along a street, so over a stretch the
    two differ by a constant: wijk K 191-195 stand on parcels K 236-240, so K 197 stands on K 242. Reversed
    direction gives a constant sum. Rule: of the linked numbers within RUN_W, at least RUN_MIN and RUN_SHARE
    agree on one constant, and the number lies between two of them. The same number linked through another
    entry is left to interpolate(). holdout() measures this at every run; main() prints the outcome.
    """
    numbers = defaultdict(list)
    for (w, n), i in exact.items():
        if parcel[i]:
            numbers[w].append(n)
    out = []
    for row in rows:
        w, n = row["wijk"], wijk_number(row)
        if row["uid"] in placed or n is None or (w, n) in exact:
            continue
        near = [k for k in numbers.get(w, ()) if abs(k - n) <= RUN_W]
        votes = Counter()
        for k in near:
            section, number = parcel[exact[(w, k)]]
            votes[(section, 1, number - k)] += 1
            votes[(section, -1, number + k)] += 1
        if not votes:
            continue
        (section, sign, c), count = votes.most_common(1)[0]
        agree = [k for k in near if parcel[exact[(w, k)]] == (section, c + sign * k)]
        if count >= RUN_MIN and count >= RUN_SHARE * len(near) and min(agree) < n < max(agree) and (section, c + sign * n) in yard:
            out.append((row, yard[(section, c + sign * n)]))
    return out


def holdout(method, exact: dict, streets: dict, geoms: list) -> dict:
    """Predict the yard of every exactly placed wijk number from the others with method(rows, placed, exact)."""
    out = Counter()
    for (w, n), yard in exact.items():
        row = {"uid": None, "wijk": w, "number": str(n), "book_street": sorted(streets[(w, n)])[0]}
        for _, i in method([row], set(), {k: v for k, v in exact.items() if k != (w, n)}):
            d = geoms[i].distance(geoms[yard])
            out["same yard" if i == yard else "adjoining" if d < 1 else "within 10 m" if d <= 10 else "further"] += 1
    return dict(out)


def write_modern(modern: dict) -> None:
    """Set address_modern (uid -> text) in the page JSONs; build_db.py and the page view read it there."""
    by_scan = defaultdict(dict)
    for uid, text in modern.items():
        by_scan[uid.rsplit(":", 1)[0]][uid] = text
    for scan, texts in by_scan.items():
        f = JSON_DIR / f"{scan}.json"
        page = json.loads(f.read_text(encoding="utf-8"))
        for occ in page.get("occupations") or []:
            for e in occ.get("entries") or []:
                if e.get("uid") in texts:
                    e["address_modern"] = texts[e["uid"]]
        f.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")


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
    premises = [not NO_PREMISES.search(f["properties"]["soort"] or "") for f in yards]
    parcel = [(f["properties"]["sectie"], int(f["properties"]["perceelnr"])) if str(f["properties"]["perceelnr"]).isdigit() else None for f in yards]
    yard_of = {}
    for i, key in enumerate(parcel):
        if key and premises[i]:
            yard_of.setdefault(key, i)
    tree = STRtree(geoms)
    bag = None
    matches: dict = {}
    used: dict = {}
    stats = Counter()
    found = []
    rows = []
    placed: set = set()
    exact: dict = {}                 # (wijk, number) -> yard index of an exactly placed entry
    streets = defaultdict(set)       # (wijk, number) -> streets the book prints for those entries
    quay_modern: dict = {}           # uid -> today's address of a quay entry placed as approximate
    off_premises = []                # (row, point, xy, today's address, quay): the point lies on a church, a bare yard
    tentative = []                   # (row, yard index, today's address, xy): placed by today's point, before the pile test
    rejected = street_rejected()

    def place(row, i, raw, xy, approx):
        pid = "hisgis-" + yards[i]["properties"]["osm"].replace("/", "-")
        used[pid] = yards[i]
        scan, idx = row["uid"].rsplit(":", 1)
        a = matches.setdefault(pid, {"addresses": {}})["addresses"].setdefault(
            raw.lower(), {"lat": xy[1], "lng": xy[0], "entries": [], "raw": raw})
        a["entries"].append(f"{scan}:{int(idx)}")
        if approx:
            a["approx"] = True  # build_db.py: geocode_type "approx"
        placed.add(row["uid"])
        stats["on_map"] += 1

    try:
        with CSV_PATH.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                rows.append(row)
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

        renumbered = renumbered_streets(found)
        for row, street, number, xy in found:
                quay = street in renumbered
                if quay:
                    # two streets on one wijk number: the first number need not belong to the first street
                    number = " / " not in row["modern_street"] and quay_number_today(street, row["wijk"], number)
                    if number:
                        bag = bag or bag_index()
                        xy = pdok_point(street, number, cache) or bag_point(bag, street, number)
                    if not (number and xy):
                        stats["street_renumbered_since_1899"] += 1
                        continue
                p = metres(Point(xy))
                i = int(tree.nearest(p))
                if geoms[i].distance(p) > SNAP_M:
                    stats["no_yard_within_%dm" % SNAP_M] += 1
                    continue
                if not premises[i]:
                    off_premises.append((row, p, xy, f"{street} {number}", quay))
                    continue
                if quay:
                    place(row, i, f"{street} {number}", xy, True)
                    quay_modern[row["uid"]] = f"± {street} {number}"
                    stats["on_map_approx"] += 1
                else:
                    tentative.append((row, i, f"{street} {number}", xy))
    finally:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False))

    numbers_on = defaultdict(set)
    for row, i, raw, xy in tentative:
        if wijk_number(row) is not None:
            numbers_on[i].add((row["wijk"], wijk_number(row)))
    piled = []
    for row, i, raw, xy in tentative:
        if len(numbers_on[i]) >= PILE:
            piled.append((row, i, raw, xy))
            continue
        place(row, i, raw, xy, False)
        if wijk_number(row) is not None:
            exact.setdefault((row["wijk"], wijk_number(row)), i)
            streets[(row["wijk"], wijk_number(row))].add(row["book_street"])
    stats["piled_yards"] = sum(len(v) >= PILE for v in numbers_on.values())

    def place_by_number(found_rows, counter):
        for row, i in found_rows:
            pt = shape(yards[i]["geometry"]).representative_point()
            place(row, i, f'{row["book_street"]} {row["wijk"]} {row["number"]}', (pt.x, pt.y), True)
            stats[counter] += 1

    place_by_number(parcel_run(rows, placed, exact, parcel, yard_of), "on_map_parcel_run")
    for row, i, raw, xy in piled:
        if row["uid"] not in placed:
            place(row, i, raw, xy, True)
            stats["on_map_piled"] += 1
    # Off premises and not in a parcel run: the nearest premises to today's point, or unlinked.
    for row, p, xy, raw, quay in off_premises:
        if row["uid"] in placed:
            continue
        near = [int(j) for j in tree.query(p.buffer(SNAP_M)) if premises[j] and geoms[j].distance(p) <= SNAP_M]
        if not near:
            stats["no_premises_within_%dm" % SNAP_M] += 1
            continue
        place(row, min(near, key=lambda j: geoms[j].distance(p)), raw, xy, True)
        stats["moved_to_premises"] += 1
        if quay:
            quay_modern[row["uid"]] = f"± {raw}"
    place_by_number(interpolate(rows, placed, exact, streets, geoms), "on_map_interpolated")

    # Quay streets: the number Grunnlink gives is that of 1899, not today's. Show today's (approximate) number
    # for the entries placed through QUAY_SIDES and the street alone for the rest.
    write_modern({r["uid"]: quay_modern.get(r["uid"], r["modern_street"]) for r in rows
                  if r["status"] in ("house", "ambiguous") and renumbered & set(r["modern_street"].split(" / "))
                  and not (r["street_check"] == "differs" and review_key(r) in rejected)})

    assert quay_number_today("Damsterdiep", "Q", "31") == "59" and not quay_number_today("Schuitendiep", "P", "40") and not quay_number_today("Damsterdiep", "Q", "20/4")
    assert stats["on_map"] > 1500, f"only {stats['on_map']} entries placed: wrong parcels file or PDOK down?"
    features = [{"type": "Feature", "geometry": f["geometry"],
                 "properties": {"pand_id": pid, "address_count": len(matches[pid]["addresses"]), "bouwjaar": None,
                                "sectie": f["properties"]["sectie"], "perceelnr": f["properties"]["perceelnr"], "soort": f["properties"]["soort"]}}
                for pid, f in used.items()]
    (OUT / "buildings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
    check = {"parcel_run": holdout(lambda r, pl, ex: parcel_run(r, pl, ex, parcel, yard_of), exact, streets, geoms),
             "interpolate": holdout(lambda r, pl, ex: interpolate(r, pl, ex, streets, geoms), exact, streets, geoms)}
    for name, c in check.items():
        assert c.get("further", 0) <= 0.1 * sum(c.values()), f"{name}: hold-out got worse: {c}"
    matches["_summary"] = dict(stats, renumbered_streets=sorted(renumbered), holdout=check)
    (OUT / "match.json").write_text(json.dumps(matches, ensure_ascii=False), encoding="utf-8")
    print(dict(stats), "on", len(features), "yards →", OUT)
    print("quay streets, house number of 1899 is not today's:", sorted(renumbered))
    print("hold-out on the exactly placed numbers:", check)


if __name__ == "__main__":
    main()
