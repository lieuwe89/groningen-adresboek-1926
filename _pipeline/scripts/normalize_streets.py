import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "data" / "adresboek.sqlite"

# Map of historical/OCR variations to modern normalized names.
# Entries are matched literally (case-sensitive, with/without trailing period) and
# as a prefix when followed by a space or '('. Structural transforms run AFTER
# direct map lookup, so include only mappings the transforms cannot derive.
NORMALIZATION_MAP = {
    "Nw. weg": "Nieuweweg",
    "Nw. Weg": "Nieuweweg",
    "n. weg": "Nieuweweg",
    "N. weg": "Nieuweweg",
    "N. Weg": "Nieuweweg",
    "Noorderweg": "Nieuweweg", # Mis-expansion of N. Weg
    "Noorder Weg": "Nieuweweg",
    "Noord Weg": "Nieuweweg",
    "Noord-Weg": "Nieuweweg",
    "Noordweg": "Nieuweweg",
    "Noordzijde Weg": "Nieuweweg",
    "Noordelijke Weg": "Nieuweweg",
    "Nieuwe weg": "Nieuweweg",
    "Nieuwe Weg": "Nieuweweg",
    "Nieuwe Weg.": "Nieuweweg",
    "A-weg": "Aweg",
    "A-WEG": "Aweg",
    "Fr. Straatweg": "Friesestraatweg",
    "Fr. straatweg": "Friesestraatweg",
    "Fr. Straatw.": "Friesestraatweg",
    "Fransestraatweg": "Friesestraatweg",
    "Frans Straatweg": "Friesestraatweg",
    "Franse Straatweg": "Friesestraatweg",
    "Fransche Straatweg": "Friesestraatweg",
    "Friesche Straatweg": "Friesestraatweg",
    "Friesche straatweg": "Friesestraatweg",
    "Friese Straatweg": "Friesestraatweg",
    "Frieschestraatweg": "Friesestraatweg",
    "Frederik Straatweg": "Friesestraatweg",
    "Frederikstraatweg": "Friesestraatweg",
    "Frederikstraat Straatweg": "Friesestraatweg",
    "Fokkerstraat": "A.P. Fokkerstraat",
    "Fokkerstr.": "A.P. Fokkerstraat",
    "A. P. Fokkerstraat": "A.P. Fokkerstraat",
    "Anna Paulowna Fokkerstraat": "A.P. Fokkerstraat",
    "Abraham Pieter Fokkerstraat": "A.P. Fokkerstraat",
    "Oude Weg": "Oudeweg",
    "Rode Weg": "Rodeweg",
    "Roode Weg": "Rodeweg",
    "Roode weg": "Rodeweg",
    "Grote Adolfstraat": "Graaf Adolfstraat",
    "Groote Adolfstraat": "Graaf Adolfstraat",
    "Gr. Adolfstraat": "Graaf Adolfstraat",
    "Gr. Adolfstr.": "Graaf Adolfstraat",
    "Gr. Adolf- straat": "Graaf Adolfstraat",

    # Boteringestraat — OCR/LLM variants. The bare form "Boteringestraat" is
    # ambiguous (Oude vs Nieuwe); build_db.py recovers Oude/Nieuwe from raw
    # OCR prefix before info is lost. Anything that reaches this dictionary
    # still un-prefixed stays bare.
    "O. Boteringestraat": "Oude Boteringestraat",
    "O. Boteringestr.": "Oude Boteringestraat",
    "O. Bot.str.": "Oude Boteringestraat",
    "Ooster Boteringestraat": "Oude Boteringestraat",
    "Oost Boteringestraat": "Oude Boteringestraat",
    "Oosterboteringestraat": "Oude Boteringestraat",
    "U. Boteringestraat": "Oude Boteringestraat",  # OCR misread of O.
    "N. Boteringestraat": "Nieuwe Boteringestraat",
    "N. Boteringestr.": "Nieuwe Boteringestraat",
    "N. Bot.str.": "Nieuwe Boteringestraat",
    "Nw. Boteringestraat": "Nieuwe Boteringestraat",
    "Noord Boteringestraat": "Nieuwe Boteringestraat",
    "Noorder Boteringestraat": "Nieuwe Boteringestraat",
    "Nieuwe Boteringetraat": "Nieuwe Boteringestraat",

    # Zuiderdiep — bare and "gedeelte/gedeeltelijk" variants are OCR readings
    # of "Gedempte". The dempte verb fills the canal — only one such street.
    "Zuiderdiep": "Gedempte Zuiderdiep",
    "Ged. Zuiderdiep": "Gedempte Zuiderdiep",
    "Gedeelte Zuiderdiep": "Gedempte Zuiderdiep",
    "Gedeeltelijk Zuiderdiep": "Gedempte Zuiderdiep",

    # Goeman Borgesiuslaan
    "Borgesiuslaan": "Goeman Borgesiuslaan",
    "Borgesiusl.": "Goeman Borgesiuslaan",
    "Borgesiusl": "Goeman Borgesiuslaan",
    "Mr. H. Goeman Borgesiuslaan": "Goeman Borgesiuslaan",
    "Mr. Goeman Borgesiuslaan": "Goeman Borgesiuslaan",

    # Mesdag — Groningen has H.W. Mesdag(plein|straat) and Taco Mesdag(plein|straat).
    # Plein bare → H.W. by user request. Straat stays bare (ambiguous between them).
    "Mesdagplein": "H.W. Mesdagplein",
    "H. W. Mesdagplein": "H.W. Mesdagplein",
    "H. W. Mesdagstraat": "H.W. Mesdagstraat",
    "H.W.Mesdagstraat": "H.W. Mesdagstraat",
    "Hendrik Willem Mesdagplein": "H.W. Mesdagplein",
    "Hendrik Willem Mesdagstraat": "H.W. Mesdagstraat",
    "Hoogte W. Mesdagplein": "H.W. Mesdagplein",
    "Hoogte W. Mesdagstraat": "H.W. Mesdagstraat",
    "T. Mesdagplein": "Taco Mesdagplein",
    "T. Mesdagstraat": "Taco Mesdagstraat",
    # Abbreviated "str./pl." forms (raw OCR had trailing period which gets
    # stripped before map lookup; both forms are listed for safety).
    "H. W. Mesdagstr": "H.W. Mesdagstraat",
    "H.W. Mesdagstr": "H.W. Mesdagstraat",
    "Taco Mesdagstr": "Taco Mesdagstraat",
    "T. Mesdagstr": "Taco Mesdagstraat",
    "Hendrik Willem Mesdagstr": "H.W. Mesdagstraat",
    "H. W. Mesdagpl": "H.W. Mesdagplein",
    "H.W. Mesdagpl": "H.W. Mesdagplein",
    "Taco Mesdagpl": "Taco Mesdagplein",
    "T. Mesdagpl": "Taco Mesdagplein",
    "Hendrik Willem Mesdagpl": "H.W. Mesdagplein",
    "Taco-Mesdagstr": "Taco Mesdagstraat",
    "Taco-Mesdagstraat": "Taco Mesdagstraat",
    "Mesdagstr": "Mesdagstraat",  # bare-stem stays bare (ambiguous H.W./Taco)

    # Hoge der A — old spelling "Hooge der A(a)" with optional hyphen.
    "Hooge der A": "Hoge der A",
    "Hooge der Aa": "Hoge der A",
    "Hoge der Aa": "Hoge der A",
    "Hooge der-A": "Hoge der A",
    "Hooge Der-A": "Hoge der A",
    "Hooge der-Aa": "Hoge der A",
    # Sibling Lage/Kleine der A — collapse "Aa" spelling to "A".
    "Lage der Aa": "Lage der A",
    "Kleine der Aa": "Kleine der A",

    # Compound old-spelling variants (\bWord\b regex below can't see inside
    # a compound, so spell them out here).
    "Grootemarkt": "Grote Markt",
    "Klein Kromme Elleboog": "Kleine Kromme Elleboog",
    "Klein Badstraat": "Kleine Badstraat",
    "Kl. Badstraat": "Kleine Badstraat",
    # BAG canonical has space between modifier and Badstraat
    # ("Ooster Badstraat", not "Oosterbadstraat").
    "Oosterbadstraat": "Ooster Badstraat",
    "Oost Badstraat": "Ooster Badstraat",
    "O. Badstraat": "Ooster Badstraat",
    "Westerbadstraat": "Wester Badstraat",
    "West Badstraat": "Wester Badstraat",
    "W. Badstraat": "Wester Badstraat",
    "Willem Badstraat": "Wester Badstraat",  # OCR mis-expansion of W.
    # "1e Drift" is consistently OCR'd as "le Drift" (lowercase L = 1).
    "le Drift": "1e Drift",
    "Le Drift": "1e Drift",
    # Spelled-out ordinals -> digit form (specific streets only; "Eerste
    # Nederlandsche Bank" is a business name, not a street, so a blanket
    # regex would over-trigger).
    "Eerste Drift": "1e Drift",
    "Tweede Drift": "2e Drift",
    "Eerste Hunzestraat": "1e Hunzestraat",
    "Tweede Hunzestraat": "2e Hunzestraat",
    "Eerste Spoorstraat": "1e Spoorstraat",
    "Tweede Spoorstraat": "2e Spoorstraat",
    "Tweede Willemstraat": "2e Willemstraat",

    # Suffix abbreviations the generic regex can't reach (the regex requires
    # a word char immediately before the suffix; "Schuitend" looks unrelated
    # to its full form, "Vischmarkt" is just an old spelling).
    "Schuitend": "Schuitendiep",
    "Vischmarkt": "Vismarkt",
    "VISCHMARKT": "Vismarkt",
    # Heavily-abbreviated compound names — the suffix regex alone leaves
    # internal "Tuinb./Ebb./etc." abbreviations intact, so map them whole.
    "Tuinb.str": "Tuinbouwstraat",
    "Tuinb.straat": "Tuinbouwstraat",
    "O. Ebb.str": "Oude Ebbingestraat",
    "O. Ebb.straat": "Oude Ebbingestraat",
    "N. Ebb.str": "Nieuwe Ebbingestraat",
    "N. Ebb.straat": "Nieuwe Ebbingestraat",
    "H. Coll.str": "Hoogere Collegestraat",
    "H. Coll.straat": "Hoogere Collegestraat",
    "Joz. Isr.str": "Jozef Israelsstraat",
    "Joz. Isr.straat": "Jozef Israelsstraat",
    "Petr. Hendriksz.str": "Petrus Hendrikszstraat",
    "Petr. Hendriksz.straat": "Petrus Hendrikszstraat",
    "Petrus Hendriksz.str": "Petrus Hendrikszstraat",
    "Petrus Hendriksz.straat": "Petrus Hendrikszstraat",
    "Petrus Hendrikz.str": "Petrus Hendrikszstraat",
    "Petrus Hendrikz.straat": "Petrus Hendrikszstraat",
    "P. Hendrikz.str": "Petrus Hendrikszstraat",
    "P. Hendrikz.straat": "Petrus Hendrikszstraat",
    "Wassenb.str": "Wassenberghstraat",
    "Wassenb.straat": "Wassenberghstraat",
    "Rabenh.str": "Rabenhauptstraat",
    "Rabenh.straat": "Rabenhauptstraat",
    "Brandenb.str": "Brandenburgerstraat",
    "Brandenb.straat": "Brandenburgerstraat",
    "Brandenburger-str": "Brandenburgerstraat",
    "Kl. Brandenb.str": "Kleine Brandenburgerstraat",
    "Kl. Brandenb.straat": "Kleine Brandenburgerstraat",
    "Kl. Brandenburgerstraat": "Kleine Brandenburgerstraat",
    "Klein Brandenburgerstraat": "Kleine Brandenburgerstraat",
    "Coll.str": "Colleniusstraat",
    "Coll.straat": "Colleniusstraat",
    "H. W. Mesd.str": "H.W. Mesdagstraat",
    "H. W. Mesd.straat": "H.W. Mesdagstraat",
    "Taco Mesd.str": "Taco Mesdagstraat",
    "Taco Mesd.straat": "Taco Mesdagstraat",
    "Jan Goevern.str": "Jan Goeverneurstraat",
    "Jan Goevern.straat": "Jan Goeverneurstraat",

    # "V. Xstraat" expansions (V. abbreviates Van in these specific streets;
    # restricted to known cases to avoid clobbering person initials).
    "V. Sijsenstraat": "Van Sijsenstraat",
    "V. Sijsenplein": "Van Sijsenplaats",  # BAG has plaats, not plein
    "V. Sijsenplaats": "Van Sijsenplaats",
    "V. Speykstraat": "Van Speykstraat",
    "V. Julsinghastraat": "Van Julsinghastraat",
    "V. Jul-singhastraat": "Van Julsinghastraat",
    "V. Jul- singhastraat": "Van Julsinghastraat",
    "V. Iddekingeweg": "Van Iddekingeweg",
    "V. Heemskerckstraat": "Van Heemskerckstraat",
    "V. Brakelplein": "Van Brakelplein",
    "V. Ketwich Verschuurlaan": "Van Ketwich Verschuurlaan",

    # 'Het Klooster' is actually written "'t Klooster" in BAG.
    "Klooster": "'t Klooster",
    "Het Klooster": "'t Klooster",
    "T Klooster": "'t Klooster",

    # OCR/transcription typos confirmed against BAG.
    "Abeenstraat": "Abeelstraat",
    "Joz. Isr.straat": "Jozef Israelsstraat",
    "Joz. Isr.str": "Jozef Israelsstraat",
    "Joz. Israëlsstraat": "Jozef Israelsstraat",
    "Joz. Israelsstraat": "Jozef Israelsstraat",
    "Jozef Israëlsstraat": "Jozef Israelsstraat",
    "Joz. Israëlsplein": "Jozef Israelsplein",
    "Joz. Israelsplein": "Jozef Israelsplein",
    "Louise Henriëttestraat": "Louise Henriettestraat",
    "H.A. Kooikerplein": "H.A. Kooykerplein",
    "H. A. Kooikerplein": "H.A. Kooykerplein",
    "Nieuwe-Kerkhof": "Nieuwe Kerkhof",
    "Oude-Kerkhof": "Oude Kerkhof",

    # Historical/defunct streets — keep canonical spelling so search works
    # even though geocoder won't match modern BAG.
    "Hav. Bot.d": "Haven Boterdiep",
    "Hav. Bot.diep": "Haven Boterdiep",

    # BAG-verified canonical fixes (fuzzy match 90+ confirmed against current BAG).
    "Oude Kijk-in-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "Nieuwe Kijk-in-'t Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "O. Kijk-in-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "N. Kijk-in-'t Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "Oude Kijk-In-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "Nieuwe Kijk-In-'t Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    # Nieuwe/N. Blekerstraat is a separate street from Blekerstraat in BAG.
    "N. Blekerstraat": "Nieuwe Blekerstraat",
    "Nw. Blekerstraat": "Nieuwe Blekerstraat",
    "Noord Blekerstraat": "Nieuwe Blekerstraat",
    "Noorder Blekerstraat": "Nieuwe Blekerstraat",
    "Nieuwe Bleekerstraat": "Nieuwe Blekerstraat",
    # "N. Sint Jansstraat" = Nieuwe Sint Jansstraat (separate from Sint Jansstraat).
    "N. Sint Jansstraat": "Nieuwe Sint Jansstraat",
    "Nw. Sint Jansstraat": "Nieuwe Sint Jansstraat",
    "O. Sint Jansstraat": "Sint Jansstraat",
    "Oude Sint Jansstraat": "Sint Jansstraat",  # only one canonical Sint Jansstraat
    # Bare "Bakkerstraat" -> only Gerbrand Bakkerstraat in modern Groningen.
    "Bakkerstraat": "Gerbrand Bakkerstraat",
    "Bakkerstr.": "Gerbrand Bakkerstraat",
    "Gerbr. Bakkerstraat": "Gerbrand Bakkerstraat",
    "Gerbr. Bakkerstr.": "Gerbrand Bakkerstraat",
    # Person-initial expansions confirmed in BAG.
    "Herm. Colleniusstraat": "Herman Colleniusstraat",
    "Joach. Altinghstraat": "Joachim Altinghstraat",
    # Straat/-straatje canonical forms per BAG.
    "Stalstraatje": "Stalstraat",
    "Soephuisstraat": "Soephuisstraatje",
    "Gasthuisstraat": "Gasthuisstraatje",
    "Hoogstraatje": "Hoogstraat",
    "Loopendediep": "Lopendediep",
    "Loopende Diep": "Lopendediep",
    "Loopendendiep": "Lopendediep",
    "Lopende Diep": "Lopendediep",
    "Roodeweg": "Rodeweg",
    "Roode Weeshuisstraat": "Rodeweeshuisstraat",
    "Roode weeshuisstraat": "Rodeweeshuisstraat",
    "Roodeweeshuisstraat": "Rodeweeshuisstraat",
    "Roodeweeshuishuisstraat": "Rodeweeshuisstraat",
    "Roodeweesthuisstraat": "Rodeweeshuisstraat",
    "Roodeweeshuisstraatje": "Rodeweeshuisstraat",
    "Visscherstraat": "Visserstraat",
    "Visschersstraat": "Visserstraat",
    "Bleekersstraat": "Blekerstraat",

    # Cross-street-prefix swap targets the regex can't infer.
    "Hissink Janssenstraat (Jan)": "Jan Hissink Janssenstraat",
    "Sitterstraat (Mr. W. de)": "Mr. W. de Sitterstraat",
}


# Parenthetical-suffix swap: "Badstraat (Kleine)" -> "Kleine Badstraat".
# Only triggers when the parenthetical token is a known size/age/position
# modifier; cross-street or location indicators (e.g., "(Schuitendiep)",
# "(Helpman)") are left alone.
SWAP_PARENTHETICAL_TOKENS = {
    "groote", "grote", "klein", "kleine", "oude", "nieuwe",
    "hooge", "hoge", "lage", "korte", "lange",
    "ooster", "wester", "noord", "zuid",
    "noordelijke", "zuidelijke",
    "sint", "gedempte", "de",
    "boven", "beneden", "voor", "achter",
    "buiten", "binnen",
    "1e", "2e", "3e", "4e", "5e",
    "eerste", "tweede", "derde", "vierde", "vijfde",
    "le", "2de", "3de", "4de", "5de",  # OCR/spelling variants of ordinals
    "hooge der", "hoge der", "lage der", "kleine der",
    "hooge der a", "hoge der a", "lage der a", "lage der-a", "kleine der a",
    "achter de", "nieuwe sint",
    "van",
}

# Normalise ordinal aliases inside a parenthetical so e.g.
# "Spoorstraat (le)" -> "1e Spoorstraat" (not "le Spoorstraat").
ORDINAL_ALIAS = {
    "le": "1e", "Le": "1e",
    "2de": "2e", "3de": "3e", "4de": "4e", "5de": "5e",
    "eerste": "1e", "tweede": "2e", "derde": "3e", "vierde": "4e", "vijfde": "5e",
    "Eerste": "1e", "Tweede": "2e", "Derde": "3e", "Vierde": "4e", "Vijfde": "5e",
}

# Spelling normalizations applied after structural transforms (and a second
# map pass picks up resulting canonical forms).
#
# Two flavors:
#   * Full-word boundaries (\b...\b) for words where compound suffixes change
#     the canonical (e.g. "Grootemarkt" is "Grote Markt", not "Grotemarkt" —
#     handled by NORMALIZATION_MAP). "Hooge" needs full \b\b to leave
#     "Oosterhoogebrug" alone.
#   * Leading-only boundaries (\b...) for suffix-preserving words like
#     "Visscherstraat" -> "Visserstraat" or "Roodeweg" -> "Rodeweg" where
#     the rest of the compound stays canonical after the substitution.
SPELLING_FIXES = (
    (re.compile(r"\bGroote\b"), "Grote"),
    (re.compile(r"\bgroote\b"), "grote"),
    (re.compile(r"\bHooge\b"), "Hoge"),
    (re.compile(r"\bhooge\b"), "hoge"),
    (re.compile(r"\bRoode"), "Rode"),
    (re.compile(r"\broode"), "rode"),
    (re.compile(r"\bFriesche"), "Friese"),
    (re.compile(r"\bFransche"), "Franse"),
    (re.compile(r"\bLoopende"), "Lopende"),
    (re.compile(r"\bBleeker"), "Bleker"),
    (re.compile(r"\bVisscher"), "Visser"),
    # Modern Dutch drops the silent 'e' in "Heer-" compounds:
    # Heereweg -> Hereweg, Heeresingel -> Heresingel, Heereplein -> Hereplein.
    (re.compile(r"\bHeere"), "Here"),
    (re.compile(r"\bheere"), "here"),
    # Compact pairs of initials: "H. L." -> "H.L.", "W. A." -> "W.A.".
    (re.compile(r"\b([A-Z])\.\s+([A-Z])\.\s+"), r"\1.\2. "),
    # "St. X" -> "Sint X" (BAG uses spelled-out form).
    (re.compile(r"\bSt\.\s+(?=[A-Z])"), "Sint "),
    # "Verl. X" -> "Verlengde X" (and lowercase variant).
    (re.compile(r"\bVerl\.\s*"), "Verlengde "),
    (re.compile(r"\bverl\.\s*"), "verlengde "),
    # Close compound nouns: "Anna-straat" -> "Annastraat",
    # "Groote Lelie-straat" -> "Groote Leliestraat",
    # "Verlengde Heere- weg" -> "Verlengde Heereweg".
    (re.compile(r"(\w)-\s*straat\b"), r"\1straat"),
    (re.compile(r"(\w)-\s*Straat\b"), r"\1Straat"),
    (re.compile(r"(\w)-\s*weg\b"), r"\1weg"),
    # Ordinal alias: "5de Drift" -> "5e Drift".
    (re.compile(r"\b(\d+)de\b"), r"\1e"),
    # Suffix-abbreviation expansion. The raw OCR had "str./pl." with trailing
    # period; build_db stripped the period and produced "Tuinbouwstr" /
    # "Heerepl". Expand whatever survived to the full canonical suffix.
    (re.compile(r"dw\.str$"), "dwarsstraat"),
    (re.compile(r"dw\.straat$"), "dwarsstraat"),
    (re.compile(r"(\w)str$"), r"\1straat"),
    (re.compile(r"(\w)pl$"), r"\1plein"),
    (re.compile(r"(\w)w$"), r"\1weg"),
)

PAREN_SWAP_RE = re.compile(
    r"^\s*(?P<base>[^()]+?)\s*\(\s*(?P<paren>[^()]+?)\s*\)\s*\.?\s*$"
)

SEARCHABLE_COLUMNS = (
    "name",
    "initials",
    "name_prefix",
    "name_prefix_expanded",
    "occupation",
    "occupation_expanded",
    "address_street",
    "address_street_expanded",
    "address_number",
    "address_full",
    "address_full_normalized",
)


def clean(value):
    return value.strip() if isinstance(value, str) else ""


def normalized_street(address_street, address_street_expanded):
    for value in (address_street, address_street_expanded):
        normalized = normalize_street_text(value)
        if normalized:
            return normalized
    return None


def apply_spelling_fixes(value):
    for pattern, replacement in SPELLING_FIXES:
        value = pattern.sub(replacement, value)
    return value


def swap_parenthetical(value):
    """'Badstraat (Kleine)' -> 'Kleine Badstraat'. Returns None if no swap."""
    if not isinstance(value, str):
        return None
    match = PAREN_SWAP_RE.match(value)
    if not match:
        return None
    base = match.group("base").rstrip(".").strip()
    paren = match.group("paren").rstrip(".").strip()
    if paren.lower() not in SWAP_PARENTHETICAL_TOKENS:
        return None
    paren = ORDINAL_ALIAS.get(paren, paren)
    return f"{paren} {base}"


def _match_normalization_map(street, street_without_trailing_period):
    for old, new in sorted(NORMALIZATION_MAP.items(), key=lambda item: len(item[0]), reverse=True):
        if street == old or street_without_trailing_period == old:
            return new
        for separator in (" ", " ("):
            prefix = f"{old}{separator}"
            if street.startswith(prefix):
                suffix = street[len(old):]
                return f"{new}{suffix}"
        if street.startswith(f"{old}."):
            suffix = street[len(old) + 1:].strip()
            return " ".join(part for part in (new, suffix) if part)
    return None


def normalize_street_text(value):
    street = clean(value)
    if not street:
        return None

    street_without_trailing_period = street.rstrip(".").strip()

    # 1. Parenthetical swap takes priority over map lookup so that
    #    "Zuiderdiep (Gedempte)" -> "Gedempte Zuiderdiep" rather than the
    #    map's "Zuiderdiep" -> "Gedempte Zuiderdiep" appending the literal
    #    "(Gedempte)" suffix.
    swapped = swap_parenthetical(street_without_trailing_period)
    if swapped is not None:
        candidate = apply_spelling_fixes(swapped)
        mapped = _match_normalization_map(candidate, candidate)
        return mapped if mapped is not None else candidate

    # 2. Direct lookup on raw input.
    mapped = _match_normalization_map(street, street_without_trailing_period)
    if mapped is not None:
        return mapped

    # 3. Remaining structural transforms.
    transformed = street_without_trailing_period
    if transformed and transformed[0].islower():
        transformed = transformed[0].upper() + transformed[1:]
    transformed = apply_spelling_fixes(transformed)

    # 4. Re-check map against transformed form.
    mapped = _match_normalization_map(transformed, transformed)
    if mapped is not None:
        return mapped

    # 5. Persist the structural transform if it changed anything.
    if transformed != street:
        return transformed
    return None


def normalize_address(street, number):
    parts = [clean(street), clean(number)]
    return " ".join(part for part in parts if part)


def normalize_search_text(row):
    return " ".join(clean(row[column]) for column in SEARCHABLE_COLUMNS if clean(row[column]))

def normalize():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    total_entries_updated = 0
    total_persons_updated = 0

    print("Normalizing street names, display addresses, searchable text, and FTS...")
    cursor.execute(
        """
        SELECT id, name, initials, name_prefix, name_prefix_expanded,
               occupation, occupation_expanded, address_street,
               address_street_expanded, address_number, address_full,
               address_full_normalized
        FROM entries
        """
    )
    rows = cursor.fetchall()
    columns = [description[0] for description in cursor.description]

    for values in rows:
        row = dict(zip(columns, values))
        new_street = normalized_street(row["address_street"], row["address_street_expanded"])
        if not new_street:
            continue

        row["address_street_expanded"] = new_street
        row["address_full"] = normalize_address(new_street, row["address_number"])
        row["address_full_normalized"] = re.sub(r"\s+", " ", row["address_full"].lower()).strip()
        row["searchable_text"] = normalize_search_text(row)

        cursor.execute(
            """
            UPDATE entries
            SET address_street_expanded = ?,
                address_full = ?,
                address_full_normalized = ?,
                searchable_text = ?
            WHERE id = ?
            """,
            (
                row["address_street_expanded"],
                row["address_full"],
                row["address_full_normalized"],
                row["searchable_text"],
                row["id"],
            ),
        )
        total_entries_updated += cursor.rowcount

    cursor.execute("SELECT id, canonical_address FROM persons")
    person_rows = cursor.fetchall()

    for person_id, canonical_address in person_rows:
        normalized_address = normalize_street_text(canonical_address)
        if not normalized_address:
            continue

        cursor.execute(
            "UPDATE persons SET canonical_address = ? WHERE id = ?",
            (normalized_address, person_id),
        )
        total_persons_updated += cursor.rowcount

    cursor.execute("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')")

    conn.commit()
    conn.close()
    print(f"Finished. Total entries updated (by street variation): {total_entries_updated}")
    print(f"Finished. Total persons updated (canonical address): {total_persons_updated}")

if __name__ == "__main__":
    normalize()
