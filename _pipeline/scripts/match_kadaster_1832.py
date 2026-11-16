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
(NO_PREMISES); and unlinked wijk numbers next to a linked one (interpolate). Where the owner
tables of 1832 are there (output/oat/oat_groningen.csv, transcribed from the RCE scans), the owner's
name corrects a link that is one yard off and places unlinked entries (owner_yards). A wijk number for
which Grunnlink gives the parcel of 1832 itself (column parcel1832: population registers of 1830/1840
against the owner tables) goes to that yard where today's address gives no exact one. For the quay streets the script also corrects address_modern in
the page JSONs: apply_omnummering.py wrote the house number of 1899 there as today's.

Needs DATA_ROOT/maps/percelen_1832.geojson (HisGIS parcels, from ~/projects/Kadaster).
Run build_db.py afterwards.
"""

import bisect
import csv
import unicodedata
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
from omnummer_wijkadressen import CACHE as GRUNNLINK_CACHE, lookup, same_street  # noqa: E402

from pipeline.config import DATA_ROOT, JSON_DIR, OUTPUT_DIR  # noqa: E402

CSV_PATH = OUTPUT_DIR / "omnummering" / "addresses.csv"
PARCELS = DATA_ROOT / "maps" / "percelen_1832.geojson"
BAG = OUTPUT_DIR / "bag" / "buildings.geojson"
OUT = OUTPUT_DIR / "kadaster1832"
CACHE = OUT / "pdok_cache.json"
OAT = OUTPUT_DIR / "oat" / "oat_groningen.csv"  # owners per parcel in 1832; the steps that use them are skipped without it
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
# Value: (c, first and last number of 1899 the fit was made on). Outside that range nothing is converted:
# Grunnlink also files wijk X ("Buiten") under Damsterdiep zuidzijde, further out than the corner houses reach.
QUAY_SIDES = {("Noorderhaven", "noordzijde"): (1, 1, 28), ("Damsterdiep", "zuidzijde"): (-3, 4, 36),
              ("Damsterdiep", "noordzijde"): (-2, 1, 33), ("Schuitendiep", "oostzijde"): (-86, 44, 91)}
# The side comes from Grunnlink (column side, v0.40.0). Where it gives none, the wijk tells the side.
QUAY_WIJK = {("Noorderhaven", "L"): "noordzijde", ("Damsterdiep", "Q"): "zuidzijde", ("Damsterdiep", "P"): "noordzijde",
             ("Schuitendiep", "O"): "oostzijde", ("Schuitendiep", "P"): "oostzijde"}


def quay_number_today(street: str, side: str, number: str) -> str | None:
    c, first, last = QUAY_SIDES.get((street, side), (None, 0, 0))
    k = re.fullmatch(r"(\d+)[a-z]?", number)  # not "20/4": a dwelling in the alley behind 20, not on the quay
    if c is None or not k or not first <= int(k.group(1)) <= last:
        return None
    return str(2 * int(k.group(1)) + c)


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
MODERN_GONE = "verdwenen"  # address_modern of a placed entry without an address of today; lib/entryPresentation.ts matches it
GAP, NEAR_M = 3, 15
# Owners of 1832 against the names of 1854 (measured 2026-11-16 on 1,962 exact links): the owner's surname stands
# on the linked yard for 11.5% of the entries and on the adjoining yard for 5%, against 0.3% by chance. So a
# namesake who owns a yard in the entry's street is evidence, strongest when he is the only one in the street.
# It is evidence of ownership, not of use (owner, 2026-11-16): the book lists where a trade was carried on, and an
# owner may let the house. So nothing placed or moved on an owner's name is exact; it is approximate and no anchor.
# An unlinked entry is placed only on the one yard in its street whose owner has its surname and first initial,
# and only for a surname that owns at most OWNER_MAX yards in town: with common names 18% lay further than 10 m.
OWNER_MAX = 8
NOT_A_SURNAME = {"van", "de", "der", "den", "ter", "ten", "te", "wed", "weduwe", "wedw", "wd", "erven", "erv", "jz", "hz",
                 "cs", "en", "mede", "eigenaren", "d", "v", "vander", "het", "junior", "senior", "jr", "sr", "bis"}


def surname(text) -> str:
    """'Veen van der' / 'Bruin / de' / 'Duinen (van)' -> 'veen' / 'bruin' / 'duinen'"""
    s = unicodedata.normalize("NFKD", str(text or "").lower()).replace("ij", "y")
    words = [w for w in re.findall(r"[a-z]+", s) if w not in NOT_A_SURNAME]
    return words[0] if words else ""


def same_name(a: str, b: str) -> bool:
    """Equal, or one letter apart for names of six letters and more: Loffens / Loffers is a reading slip."""
    if a == b:
        return bool(a)
    if min(len(a), len(b)) < 6 or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    a, b = sorted((a, b), key=len)
    return any(a == b[:i] + b[i + 1:] for i in range(len(b)))


def load_owners(parcel: list) -> dict:
    """yard index -> {(surname, first initial)} of the owners of 1832, both readings, struck rows too."""
    by_parcel = defaultdict(list)
    for i, key in enumerate(parcel):
        if key:
            by_parcel[key].append(i)
    out = defaultdict(set)
    for r in csv.DictReader(OAT.open(encoding="utf-8", newline="")):
        if r["instantie"] == "1" or not r["perceelnr"].isdecimal():
            continue
        names = {(surname(r[n]), (re.search(r"[A-Za-z]", r[v] or "") or [""])[0].lower())
                 for n, v in (("naam", "voornamen"), ("naam_gemini", "voornamen_gemini"), ("naam_claude", "voornamen_claude"))}
        for i in by_parcel.get((r["sectie"], int(r["perceelnr"])), ()):
            out[i] |= {n for n in names if n[0]}
    return out


def entry_initials() -> dict:
    """uid -> first initial of the entry, from the page JSONs (addresses.csv has the surname only)."""
    out = {}
    for f in JSON_DIR.glob("*.json"):
        for occ in json.loads(f.read_text(encoding="utf-8")).get("occupations") or []:
            for e in occ.get("entries") or []:
                m = re.search(r"[A-Za-z]", e.get("initials") or "")
                out[e.get("uid")] = m.group().lower() if m else ""
    return out


def owner_yards(row: dict, initial, owners: dict, by_street: dict) -> set:
    """Yards along the entry's street of today whose owner of 1832 carries the entry's surname.

    initial None: the surname is enough. Otherwise the owner's first name must start with that letter too.
    """
    name = surname(row["name"])
    along = {y for s in row["modern_street"].split(" / ") if s for c in expanded_streets(s) for y in by_street.get(c, ())}
    return {y for y in along if any(same_name(name, o) and (initial is None or (initial and initial == i)) for o, i in owners.get(y, ()))}


def owner_place(row: dict, initial: str, owners: dict, by_street: dict, spread: Counter):
    """The yard an unlinked entry goes to on its owner's name, or None (see OWNER_MAX)."""
    found = owner_yards(row, initial, owners, by_street)
    name = surname(row["name"])
    if len(found) == 1 and sum(n for o, n in spread.items() if same_name(name, o)) <= OWNER_MAX:
        return next(iter(found))
    return None


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


def grunnlink_anchors(rows: list, placed: set, renumbered: set, bag: dict, tree, geoms: list, premises: list) -> dict:
    """(wijk, number) -> (Grunnlink street, yard index) for the wijk numbers within GAP of an unplaced entry.

    Also numbers the book never prints: Grunnlink knows A 37 and A 40 around A 39, the book only A 36 and A 41.
    Fetched once per number into omnummer_wijkadressen.py's cache; today's point from the BAG, quay streets left out.
    """
    cache = json.loads(GRUNNLINK_CACHE.read_text()) if GRUNNLINK_CACHE.exists() else {}
    try:
        for row in rows:
            n = wijk_number(row)
            if row["uid"] not in placed and n is not None and re.fullmatch(r"[A-Z]+", row["wijk"]):
                for k in range(max(1, n - GAP), n + GAP + 1):
                    lookup(row["wijk"], str(k), cache)
    finally:
        GRUNNLINK_CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    out = {}
    for key, v in cache.items():
        w, _, n = key.partition(" ")
        if not (n.isdecimal() and v and v.get("kind") == "house" and len(v["results"]) == 1):
            continue
        street, number = v["results"][0]["street"], v["results"][0].get("newNumber") or ""
        xy = street not in renumbered and re.match(r"\d", number) and bag_point(bag, street, number)
        if not xy:
            continue
        p = metres(Point(xy))
        i = int(tree.nearest(p))
        if geoms[i].distance(p) <= SNAP_M and premises[i]:
            out[(w, int(n))] = (street, i)
    return out


def interpolate_grunnlink(rows: list, placed: set, anchors: dict, geoms: list) -> list:
    """Unplaced entries between two wijk numbers Grunnlink places, printed in the book or not: [(row, yard index)].

    Rule: a known number within GAP on either side, their yards the same or within NEAR_M, and Grunnlink puts one
    of them in the street the book prints. The entry goes to the yard of the nearer one. Measured 2026-11-16 on
    the exact links: 696 predictions, 5.6% further than 10 m (interpolate(): 3.9%); holdout() checks every run.
    """
    out = []
    for row in rows:
        w, n = row["wijk"], wijk_number(row)
        if row["uid"] in placed or n is None:
            continue
        lo = next((n - d for d in range(1, GAP + 1) if (w, n - d) in anchors), None)
        hi = next((n + d for d in range(1, GAP + 1) if (w, n + d) in anchors), None)
        if lo is None or hi is None:
            continue
        (sa, a), (sb, b) = anchors[(w, lo)], anchors[(w, hi)]
        if (a == b or geoms[a].distance(geoms[b]) <= NEAR_M) and (same_street(row["book_street"], sa) or same_street(row["book_street"], sb)):
            out.append((row, a if n - lo <= hi - n else b))
    return out


def same_person(rows: list, placed: set, yard_of_uid: dict, initials: dict) -> list:
    """Unplaced entries whose person is placed elsewhere in the book, in the same street, on one yard: [(row, yard index)].

    The book lists a person once per trade. P. de Vries stands on Martini Kerkhof C 170 and C 117, the second a
    misprint (straatreview). Of the 16 found on 2026-11-16 most are a misread digit: H 30/50, F 280/180, P 97/79.
    """
    who = lambda r: (surname(r["name"]), initials.get(r["uid"], ""))
    seen = defaultdict(list)
    for row in rows:
        if row["uid"] in yard_of_uid:
            seen[who(row)].append(row)
    out = []
    for row in rows:
        if row["uid"] in placed or not all(who(row)):
            continue
        found = {yard_of_uid[o["uid"]] for o in seen.get(who(row), ()) if same_street(row["book_street"], o["book_street"])}
        if len(found) == 1:
            out.append((row, found.pop()))
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
    yard_of, yard_any = {}, {}
    for i, key in enumerate(parcel):
        if key:
            yard_any.setdefault(key, i)
            if premises[i]:
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
    by_register = []                 # (row, yard index): the parcel of 1832 as Grunnlink gives it
    tentative = []                   # (row, yard index, today's address, xy): placed by today's point, before the pile test
    rejected = street_rejected()
    yard_of_uid: dict = {}
    exact_uid: dict = {}             # uid -> yard index, exact links only

    def place(row, i, raw, xy, approx):
        pid = "hisgis-" + yards[i]["properties"]["osm"].replace("/", "-")
        used[pid] = yards[i]
        yard_of_uid[row["uid"]] = i
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
                if row.get("parcel1832"):  # Grunnlink names the parcel of 1832 itself; used where today's address gives no exact yard
                    section, number = row["parcel1832"].split()
                    if (section, int(number)) in yard_any:
                        by_register.append((row, yard_any[(section, int(number))]))
                    else:
                        stats["register_parcel_not_on_map"] += 1
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
                    side = row.get("side") or QUAY_WIJK.get((street, row["wijk"]), "")
                    number = " / " not in row["modern_street"] and quay_number_today(street, side, number)
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

    owners, by_street, initials, owner_check, owner_moved = {}, defaultdict(set), {}, Counter(), set()
    if OAT.exists():
        owners, initials = load_owners(parcel), entry_initials()
        spread = Counter(o for names in owners.values() for o in {n for n, _ in names})  # surname -> yards owned in town
        for (street, _, _), xy in (bag or bag_index()).items():  # the yards under today's addresses of a street
            p = metres(Point(xy))
            i = int(tree.nearest(p))
            if geoms[i].distance(p) <= SNAP_M:
                by_street[street].add(i)
        corrected = []
        for row, i, raw, xy in tentative:
            # hold-out of the placing rule below, on the links as today's address gives them
            j = owner_place(row, initials.get(row["uid"], ""), owners, by_street, spread)
            if j is not None:
                d = geoms[i].distance(geoms[j])
                owner_check["same yard" if i == j else "adjoining" if d < 1 else "within 10 m" if d <= 10 else "further"] += 1
            # The only namesake in the street owns the yard next door (apothecary Hoitsema, wijk F 327: point on
            # I 365, Hoitsema owns I 366). Probably today's point is one yard off; he may also own the one and
            # work in the other. The entry goes to the owner's yard as approximate: both yards are "this or the next".
            namesakes = owner_yards(row, None, owners, by_street)
            if namesakes == {i}:
                stats["confirmed_by_owner"] += 1
            elif len(namesakes) == 1 and geoms[i].distance(geoms[next(iter(namesakes))]) < 1 and premises[next(iter(namesakes))]:
                i = next(iter(namesakes))
                owner_moved.add(row["uid"])
                stats["moved_to_owner_yard"] += 1
            corrected.append((row, i, raw, xy))
        tentative = corrected

    numbers_on = defaultdict(set)
    for row, i, raw, xy in tentative:
        if wijk_number(row) is not None and row["uid"] not in owner_moved:
            numbers_on[i].add((row["wijk"], wijk_number(row)))
    piled = []
    for row, i, raw, xy in tentative:
        if row["uid"] in owner_moved:
            place(row, i, raw, xy, True)
            continue
        if len(numbers_on[i]) >= PILE:
            piled.append((row, i, raw, xy))
            continue
        place(row, i, raw, xy, False)
        exact_uid[row["uid"]] = i
        if wijk_number(row) is not None:
            exact.setdefault((row["wijk"], wijk_number(row)), i)
            streets[(row["wijk"], wijk_number(row))].add(row["book_street"])
    stats["piled_yards"] = sum(len(v) >= PILE for v in numbers_on.values())

    def place_by_number(found_rows, counter):
        for row, i in found_rows:
            pt = shape(yards[i]["geometry"]).representative_point()
            place(row, i, f'{row["book_street"]} {row["wijk"]} {row["number"]}', (pt.x, pt.y), True)
            stats[counter] += 1

    # Grunnlink's own check on wijk K: 9 of 10 such parcels on the house or its neighbour. So approximate, like the rest.
    # Grunnlink v0.42 gives parcels for wijk A-S (84% same or adjoining yard in its own hold-out): an exact link through
    # today's address goes first, the register parcel fills in where that failed or only gave an approximation.
    place_by_number([(r, i) for r, i in by_register if r["uid"] not in placed], "on_map_register")
    check_register = Counter()
    for r, i in by_register:  # the register parcel against the exact links: is it as good as Grunnlink says?
        if r["uid"] in exact_uid:
            d = geoms[i].distance(geoms[exact_uid[r["uid"]]])
            check_register["same yard" if i == exact_uid[r["uid"]] else "adjoining" if d < 1 else "within 10 m" if d <= 10 else "further"] += 1
    place_by_number(parcel_run(rows, placed, exact, parcel, yard_of), "on_map_parcel_run")
    # Not placed yet (unlinked, piled, off premises): one owner in the street with the same surname and first initial.
    by_owner = []
    for row in rows:
        if row["uid"] not in placed and row["status"] != "none":
            j = owner_place(row, initials.get(row["uid"], ""), owners, by_street, spread) if owners else None
            if j is not None and premises[j]:
                by_owner.append((row, j))
    place_by_number(by_owner, "on_map_owner")
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
    # Both rules below go by the book's street. Where Grunnlink gives another street (C 117: Schuitendiep, the book
    # Martini Kerkhof) two sources disagree; such an entry stays out until a source settles it.
    by_book = [r for r in rows if r["street_check"] != "differs" or review_key(r) in rejected]
    place_by_number(same_person(by_book, placed, yard_of_uid, initials or entry_initials()), "on_map_same_person")
    bag = bag or bag_index()
    anchors = grunnlink_anchors(by_book, placed, renumbered, bag, tree, geoms, premises)
    place_by_number(interpolate_grunnlink(by_book, placed, anchors, geoms), "on_map_grunnlink_neighbours")

    # Quay streets: the number Grunnlink gives is that of 1899, not today's. Show today's (approximate) number
    # for the entries placed through QUAY_SIDES and the street alone for the rest.
    modern = {r["uid"]: quay_modern.get(r["uid"], r["modern_street"]) for r in rows
              if r["status"] in ("house", "ambiguous") and renumbered & set(r["modern_street"].split(" / "))
              and not (r["street_check"] == "differs" and review_key(r) in rejected)}
    # On the map, but Grunnlink knows no address of today: the house is gone. The site shows a label for MODERN_GONE.
    modern.update({r["uid"]: MODERN_GONE for r in rows if r["status"] == "none" and r["uid"] in placed})
    write_modern(modern)

    assert quay_number_today("Damsterdiep", "zuidzijde", "31") == "59" and not quay_number_today("Schuitendiep", "oostzijde", "40") and not quay_number_today("Damsterdiep", "zuidzijde", "20/4")
    assert stats["on_map"] > 1500, f"only {stats['on_map']} entries placed: wrong parcels file or PDOK down?"
    features = [{"type": "Feature", "geometry": f["geometry"],
                 "properties": {"pand_id": pid, "address_count": len(matches[pid]["addresses"]), "bouwjaar": None,
                                "sectie": f["properties"]["sectie"], "perceelnr": f["properties"]["perceelnr"], "soort": f["properties"]["soort"]}}
                for pid, f in used.items()]
    (OUT / "buildings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
    check = {"parcel_run": holdout(lambda r, pl, ex: parcel_run(r, pl, ex, parcel, yard_of), exact, streets, geoms),
             "interpolate": holdout(lambda r, pl, ex: interpolate(r, pl, ex, streets, geoms), exact, streets, geoms),
             # anchors were fetched around the unplaced numbers only, so this measures the exact numbers that lie near them
             "grunnlink_neighbours": holdout(lambda r, pl, ex: interpolate_grunnlink(r, pl, anchors, geoms), exact, streets, geoms)}
    for name, c in check.items():
        assert c.get("further", 0) <= 0.1 * sum(c.values()), f"{name}: hold-out got worse: {c}"
    if owner_check:  # namesakes do live elsewhere in a street: a wider margin than for the number rules
        assert owner_check["further"] <= 0.15 * sum(owner_check.values()), f"owner: hold-out got worse: {owner_check}"
        check["owner"] = dict(owner_check)
    # 2026-11-16, Grunnlink v0.42: 50 of 434 further than 10 m; the same margin as the owner rule
    assert check_register["further"] <= 0.15 * max(1, sum(check_register.values())), f"register: hold-out got worse: {check_register}"
    check["register"] = dict(check_register)
    matches["_summary"] = dict(stats, renumbered_streets=sorted(renumbered), holdout=check)
    (OUT / "match.json").write_text(json.dumps(matches, ensure_ascii=False), encoding="utf-8")
    print(dict(stats), "on", len(features), "yards →", OUT)
    print("quay streets, house number of 1899 is not today's:", sorted(renumbered))
    print("hold-out on the exactly placed numbers:", check)


if __name__ == "__main__":
    main()
