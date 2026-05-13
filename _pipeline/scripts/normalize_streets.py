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
    # Ordinal canonical forms are MIXED in BAG:
    #   1e/2e Drift Ged. Zuiderdiep (digit)
    #   Eerste/Tweede Drift Spilsluizen, Derde Drift Lopendediep,
    #   Vierde/Vijfde Drift Noorderhaven (spelled out)
    #   Eerste Hunzestraat, Tweede Hunzestraat (spelled out)
    # So the v0.8.6 blanket Eerste->1e / Tweede->2e mappings have been removed
    # and replaced by user-checked entries near the bottom of the dict.

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

    # === Truncated stems (build_db.py's key.title() fallback chopped these
    #     when raw OCR ended in an abbreviation + period). Each completes to
    #     the unique BAG canonical street. ===
    "Damsterd": "Damsterdiep",
    "Winschoterd": "Winschoterdiep",
    "Boterd": "Boterdiep",
    "Hoend": "Hoendiep",
    "Hoornsched": "Hoornsediep",
    "Zuiderd": "Gedempte Zuiderdiep",
    "Ged. Zuiderd": "Gedempte Zuiderdiep",
    "Oostersing": "Oostersingel",
    "Praediniuss": "Praediniussingel",
    "Ganzevoorts": "Ganzevoortsingel",
    "Ganzevoortsing": "Ganzevoortsingel",
    "Coehoorns": "Coehoornsingel",
    "Noorderbinnens": "Noorderbinnensingel",
    "Noorderbuitens": "Noorderbuitensingel",
    "Noorderbuitensing": "Noorderbuitensingel",
    "Westerbinnens": "Westerbinnensingel",
    "Herebinnens": "Herebinnensingel",
    "Eelders": "Eeldersingel",
    "Noorderh": "Noorderhaven",
    "Westerh": "Westerhaven",
    "Meeuwerderb": "Meeuwerderbaan",
    "Oosterh": "Oosterhamrikbaan",
    "Reitdiepsk": "Reitdiepskade",
    "Steenhouwersk": "Steenhouwerskade",
    "Martinikerkh": "Martinikerkhof",
    "Koninginnel": "Koninginnelaan",
    "Uurwerkersg": "Uurwerkersgang",
    "Koster": "Kostersgang",
    "Kostergang": "Kostersgang",
    "Herepoortenmolendr": "Herepoortenmolendrift",
    "Petr. Campersing": "Petrus Campersingel",
    "Petr. Campersingel": "Petrus Campersingel",
    "Petrus Campersingel": "Petrus Campersingel",

    # Snor — multiple 1926 streets shared the name. Only the Damsterdiep
    # branch survives in BAG ("Snor Damsterdiep"). Per-user correction:
    # the Boterdiep branch is a separate historical street, do NOT merge.
    "Snor (Damsterdiep)": "Snor Damsterdiep",
    "Snor (Binnen Damsterdiep)": "Snor Damsterdiep",
    # "Snor (Boterdiep)" and "Snor 148 (Boterdiep)" intentionally left
    # alone — historical street, no BAG match.

    "Brink": "Brinklaan",
    "Oliemulderswegje": "Oliemuldersweg",

    # === Spilsluizen / Drift compound names (BAG canonical strips paren
    #     and uses Eerste/Tweede/Derde/Vierde/Vijfde for Spilsluizen,
    #     Lopendediep, Noorderhaven; digit form 1e/2e for Ged. Zuiderdiep). ===
    "Grote Spilsluizen": "Spilsluizen",
    "Groote Spilsluizen": "Spilsluizen",
    "5e Drift (Noorderhaven)": "Vijfde Drift Noorderhaven",
    "5de Drift (Noorderhaven)": "Vijfde Drift Noorderhaven",
    "Vijfde Drift (Noorderhaven)": "Vijfde Drift Noorderhaven",
    "4e Drift (Noorderhaven)": "Vierde Drift Noorderhaven",
    "4de Drift (Noorderhaven)": "Vierde Drift Noorderhaven",
    "Vierde Drift (Noorderhaven)": "Vierde Drift Noorderhaven",
    "1e Drift (Spilsluizen)": "Eerste Drift Spilsluizen",
    "Eerste Drift (Spilsluizen)": "Eerste Drift Spilsluizen",
    "2e Drift (Spilsluizen)": "Tweede Drift Spilsluizen",
    "2de Drift (Spilsluizen)": "Tweede Drift Spilsluizen",
    "Tweede Drift (Spilsluizen)": "Tweede Drift Spilsluizen",
    "3e Drift (Lopende Diep)": "Derde Drift Lopendediep",
    "3de Drift (Lopende Diep)": "Derde Drift Lopendediep",
    "3e Drift (Lopendediep)": "Derde Drift Lopendediep",
    "Derde Drift (Lopende Diep)": "Derde Drift Lopendediep",
    "1e Drift (Ged. Zuiderdiep)": "1e Drift Ged. Zuiderdiep",
    "1e Drift (Gedempte Zuiderdiep)": "1e Drift Ged. Zuiderdiep",
    "2e Drift (Ged. Zuiderdiep)": "2e Drift Ged. Zuiderdiep",
    "2de Drift (Ged. Zuiderdiep)": "2e Drift Ged. Zuiderdiep",
    "2e Drift (Gedempte Zuiderdiep)": "2e Drift Ged. Zuiderdiep",

    # === Paren cross-street indicators / side designators — drop the paren ===
    # Exception: "Kerkstraat (Helpman)" is BAG-canonical "Helper Kerkstraat",
    # a distinct street in the Helpman neighbourhood (not the city centre's
    # "Kerkstraat").
    "Kerkstraat (Helpman)": "Helper Kerkstraat",
    "Kerkstraat (Helpm)": "Helper Kerkstraat",
    "Kerkstraat Helpman": "Helper Kerkstraat",
    "Helpman Kerkstraat": "Helper Kerkstraat",
    "Stationsweg (Voormiddag)": "Stationsweg",
    "Smakkersgang (Schuitendiep)": "Smakkersgang",
    "Hopmansgang (Schuitendiep)": "Hopmansgang",
    "Kleine Gang (Schuitendiep)": "Kleine Gang",
    "Kleine Gang (Schuitendiep.)": "Kleine Gang",
    "Grote gang (Schuitendiep)": "Grote Gang",
    "Grote Gang (Schuitendiep)": "Grote Gang",
    "Noorderhaven (Noord-Zuid)": "Noorderhaven",
    "Noorderhaven (Zuid-Zuid)": "Noorderhaven",
    "Bocht van Guinea (Damsterdiep)": "Bocht van Guinea",
    "Bocht Van Guinea Damsterd": "Bocht van Guinea",
    "Bocht van Guinea 1 (Damsterdiep)": "Bocht van Guinea",
    "Hoendiep Z.Z": "Hoendiep",
    "Hoendiep N.Z": "Hoendiep",
    "Hoendiep (Hoogkerk)": "Hoendiep",
    "'t Klooster (Butjesstraat)": "'t Klooster",
    "Oliemulderswegje (Buiten Damsterdiep)": "Oliemuldersweg",

    # === OCR mis-reads of common street names ===
    "Groninger Markt": "Grote Markt",
    "Grooter Markt": "Grote Markt",

    # === 1926-spelling -> modern BAG (verified BAG has only the modern form) ===
    "Sabangplaats": "Sabangplein",
    "Houtzagerssteeg": "Houtzagersstraat",
    "Houtzagersteeg": "Houtzagersstraat",
    "Jacobijnerweg": "Jacobijnerstraat",
    # "Papiermolen": kept as historical per user review (not Papiermolenlaan)

    # === User-checked fuzzy matches (TSV review 2026-05-12) ===
    # 285 mappings vetted against BAG via Google Sheets. Source TSV:
    # 'Checked street names Groningen 1926'.
    "Oortwijn. Boterdiep": "Boterdiep",
    "Oofstraat": "Ooftstraat",
    "Oliemulderweg": "Oliemuldersweg",
    "O. Kijk in 't Jatstraat": "Oude Kijk in 't Jatstraat",
    "Noorder-binnensingel": "Noorderbinnensingel",
    "Noorder Stationsstraat": "Noorderstationsstraat",
    "Noorder Binnensingel": "Noorderbinnensingel",
    "Noordbinnensingel": "Noorderbinnensingel",
    "Noord Kerkstraat": "Noorderkerkstraat",
    "Nieuwe kerkhof": "Nieuwe Kerkhof",
    "Nieuwe Kijk-in-t Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "Nieuwe Bleekestraat": "Nieuwe Blekerstraat",
    "Mr. S.M. S. Moddermanlaan": "Moddermanlaan",
    "Meenwerderweg": "Meeuwerderweg",
    "Mauritstraat": "Mauritsstraat",
    "Mauriitsdwarsstraat": "Mauritsdwarsstraat",
    "Martini kerkhof": "Martinikerkhof",
    "Lohmanplein": "De Savornin Lohmanplein",
    "Leliestraat": "Grote Leliestraat",
    "Leeuwardenstraat": "Leeuwarderstraat",
    "Kostergang": "Kostersgang",
    "Koningsginnelaan": "Koninginnelaan",
    "Koning Brandenburgerstraat": "Brandenburgerstraat",
    "Koniginnelaan": "Koninginnelaan",
    "Kleine Kruistraat": "Kleine Kruisstraat",
    "Klein Rozenstraat": "Kleine Rozenstraat",
    "Kl. Butjesstraat": "Kleine Butjesstraat",
    "Ketwich Verschuurlaan": "Van Ketwich Verschuurlaan",
    "Kantoren Westerkade": "Westerkade",
    "Kantoren Muurstraat": "Muurstraat",
    "Kantoor Winschoterdiep": "Winschoterdiep",
    "Kantoor Piet Heinstraat": "Piet Heinstraat",
    "Kantoor Musschengang Schuitendiep": "Mussengang",
    "Kantoor Martinikerkhof": "Martinikerkhof",
    "Kantoor Lodewijkstraat": "Lodewijkstraat",
    "Kantoor Aweg": "Aweg",
    "Kant. Zwanestraat": "Zwanestraat",
    "Kant. Grote Markt": "Grote Markt",
    "Kant. Fruitstraat": "Fruitstraat",
    "KI. Pelsterstraat": "Kleine Pelsterstraat",
    "KI. Haddingestraat": "Kleine Haddingestraat",
    "Jozel Israëlsstraat": "Jozef Israëlsstraat",
    "Jozef Israëlstraat": "Jozef Israëlsstraat",
    "Jozef Iraëlsstraat": "Jozef Israëlsstraat",
    "Johan Willem Frissostraat": "Johan Willem Frisostraat",
    "Johan Willem Friso straat": "Johan Willem Frisostraat",
    "Joachim Aitinghstraat": "Joachim Altinghstraat",
    "Joach. Altingstraat": "Joachim Altinghstraat",
    "Java-laan": "Javalaan",
    "Jan Goeveneurstraat": "Jan Goeverneurstraat",
    "Jacobiinerstraat": "Jacobijnerstraat",
    "Jaco-bijnerstraat": "Jacobijnerstraat",
    "Israëlsplein": "Jozef Israëlsplein",
    "Houtzagerstraat": "Houtzagersstraat",
    "Hoendiepkade": "Hoendiepskade",
    "Hermanus Colleniusstraat": "Herman Colleniusstraat",
    "Herepoorten- molendrift": "Herepoortenmolendrift",
    "Herepoor- tenmolendrift": "Herepoortenmolendrift",
    "Herebinn.singel": "Herebinnensingel",
    "Herebin- nensingel": "Herebinnensingel",
    "Here-binnensingel": "Herebinnensingel",
    "Hendrikzestraat": "Hendrikstraat",
    "Heinstraat": "Piet Heinstraat",
    "Haddingstraat": "Haddingestraat",
    "Haddingedwarstraat": "Haddingedwarsstraat",
    "Had-dingestraat": "Haddingestraat",
    "H.L. Wicherstraat": "H.L. Wichersstraat",
    "H.L. Wichers straat": "H.L. Wichersstraat",
    "H.A. Kooiker-plein": "H.A. Kooykerplein",
    "H. W Mesdagstraat": "H.W. Mesdagstraat",
    "Guldensstraat": "Guldenstraat",
    "Grote Lelistraat": "Grote Leliestraat",
    "Grote Gang Schuitendiep": "Grote Gang",
    "Grote Bergstraat": "Bergstraat",
    "Gron. Guldenstraat": "Guldenstraat",
    "Gr. Bergstraat": "Bergstraat",
    "Goorechtkade": "Gorechtkade",
    "Goeverneurstraat": "Jan Goeverneurstraat",
    "Gerbranda Bakkerstraat": "Gerbrand Bakkerstraat",
    "Gerbr Bakkerstraat": "Gerbrand Bakkerstraat",
    "Gerben Bakkerstraat": "Gerbrand Bakkerstraat",
    "Gelkingsestraat": "Gelkingestraat",
    "Gelkingestraat in de Donkersgang": "Donkersgang",
    "Gedempte Katten-diep": "Gedempte Kattendiep",
    "G. Raamstraat": "Raamstraat",
    "Filiaal De Laan": "De Laan",
    "Federikstraat": "Frederikstraat",
    "Euvelgunneweg": "Euvelgunnerweg",
    "Emmaasingel": "Emmasingel",
    "Emma-singel": "Emmasingel",
    "Emma plein": "Emmaplein",
    "Elleboog": "Grote Kromme Elleboog",
    "Eergstraat": "Bergstraat",
    "Eerelmanstraat": "Otto Eerelmanstraat",
    "De Savornin Lohman- plein": "De Savornin Lohmanplein",
    "Damster-singel": "Damstersingel",
    "Damster singel": "Damstersingel",
    "Cubaastraat": "Cubastraat",
    "Coehoorsingel": "Coehoornsingel",
    "Butjestraat": "Butjesstraat",
    "Bureau Turftorenstraat": "Turftorenstraat",
    "Bureau Tuinbouwstraat": "Tuinbouwstraat",
    "Bureau Noorderhaven": "Noorderhaven",
    "Buiten-Damsterdiep": "Damsterdiep",
    "Brandenburstraat": "Brandenburgerstraat",
    "Bouwmanstraat": "Boumanstraat",
    "Bloem-singel": "Bloemsingel",
    "Binnenste Damsterdiep": "Damsterdiep",
    "Binnen-Damsterdiep": "Damsterdiep",
    "Bernouilliplein": "Bernoulliplein",
    "Appelstraat": "Grote Appelstraat",
    "Anna Paulownsstraat": "Anna Paulownastraat",
    "Albert Agnesplein": "Albertine Agnesplein",
    "Akerkstraat": "Akerkhofstraat",
    "Achter de Noorderkuipen (Turfsingel": "Achter de Noorderkuipen",
    "Acherweg": "Achterweg",
    "A.P. Fok- kerstraat": "A.P. Fokkerstraat",
    "1e Drift Zuiderdiep": "1e Drift Ged. Zuiderdiep",
    "(Kl. Pelsterstraat": "Kleine Pelsterstraat",
    "2e Hunzestraat": "Tweede Hunzestraat",
    "Gr. Leliestraat": "Grote Leliestraat",
    "1e Hunzestraat": "Eerste Hunzestraat",
    "O. Ebbingestraat": "Oude Ebbingestraat",
    "Ooster Ebbingestraat": "Oude Ebbingestraat",
    "Griffestraat": "Griffeweg",
    "Gr. Rozenstraat": "Grote Rozenstraat",
    "Rhijnvis Feithplein": "R. Feithplein",
    "Cortinghstraat": "Cortinghlaan",
    "Driehovenplaats": "Driehovenstraat",
    "Le Hunzestraat": "Eerste Hunzestraat",
    "Gr. Appelstraat": "Grote Appelstraat",
    "Grote Kruis Elleboog": "Grote Kromme Elleboog",
    "P. Heinstraat": "Piet Heinstraat",
    "A. Paulownastraat": "Anna Paulownastraat",
    "Gr. Kruisstraat": "Grote Kruisstraat",
    "Gerb. Bakkerstraat": "Gerbrand Bakkerstraat",
    "Gebr. Bakkerstraat": "Gerbrand Bakkerstraat",
    "Doctor D. Bosstraat": "Dr. D. Bosstraat",
    "Joh. W. Frisostraat": "Johan Willem Frisostraat",
    "J. Israëlsstraat": "Jozef Israëlsstraat",
    "H. Colleniusstraat": "Herman Colleniusstraat",
    "Prof. H.C. van Hallstraat": "Professor H.C. van Hallstraat",
    "Kl. Leliestraat": "Kleine Leliestraat",
    "Kl. Kruisstraat": "Kleine Kruisstraat",
    "De Sav. Lohmanplein": "De Savornin Lohmanplein",
    "Vischhoek": "Vishoek",
    "Oost Ebbingestraat": "Oude Ebbingestraat",
    "Kl. Rozenstraat": "Kleine Rozenstraat",
    "J. Lutmastraat": "Jan Lutmastraat",
    "Prof. H.C. v. Hallstraat": "Professor H.C. van Hallstraat",
    "Martini Kerkhof": "Martinikerkhof",
    "Le Spoorstraat": "Eerste Spoorstraat",
    "Kleine gang": "Kleine Gang",
    "Kl. Molenstraat": "Kleine Molenstraat",
    "Johan W. Frisostraat": "Johan Willem Frisostraat",
    "3e Drift": "Derde Drift Lopende Diep",
    "Prof. Rankestraat": "Professor Rankestraat",
    "P. Campersingel": "Petrus Campersingel",
    "Kleine Kruis Elleboog": "Kleine Kromme Elleboog",
    "Kl. Appelstraat": "Kleine Appelstraat",
    "Hoenderstraat": "Hendrikstraat",
    "H.A. Kooiker- plein": "H.A. Kooykerplein",
    "Noorder Haven": "Noorderhaven",
    "Noord Buitensingel": "Noorderbuitensingel",
    "N.-Stationstraat": "Noorderstationsstraat",
    "J.W. Frisostraat": "Johan Willem Frisostraat",
    "J. Israëlsplein": "Josef Israëlsplein",
    "J. Altinghstraat": "Joachim Altinghstraat",
    "Gr. Markt": "Grote Markt",
    "Gedeelte Kattendiep": "Gedempte Kattendiep",
    "Gebroeders Bakkerstraat": "Gerbrand Bakkerstraat",
    "Am. v. Solmsstraat": "Amalia van Solmsstraat",
    "1ste Hunzestraat": "Eerste Hunzestraat",
    "Zuider-singelstraat": "Ubbo Emmiusstraat",
    "W. de Withstraat": "Witte de Withstraat",
    "W. de Sitterstraat": "De Sitterstraat",
    "Van Sijsenplein": "Van Sijsenplaats",
    "Reitema-rijge": "Reitemakersrijge",
    "Ooster Eerelmanstraat": "Otto Eerelmanstraat",
    "O. Eerelmanstraat": "Otto Eerelmanstraat",
    "Noord Kijk-in-'t Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "Nieuwekerkhof": "Nieuwe Kerkhof",
    "L. Henriëttestraat": "Louise Henriëttestraat",
    "Koninginnesingellaan": "Koninginnelaan",
    "Herepoortenm.drift": "Herepoortenmolendrift",
    "Herep.molendrift": "Herepoortenmolendrift",
    "Helper­oostsingel": "Helper Oostsingel",
    "G. Bakkerstraat": "Gerbrand Bakkerstraat",
    "Doctor Cornelis Hofstede de Grootkade": "Doctor C. Hofstede de Grootkade",
    "A. Tasmanstraat": "Abel Tasmanstraat",
    "Zwanenpottebakkersrijge": "Pottebakkersrijge",
    "Westerharingstraat": "Westerhavenstraat",
    "Westerh.straat": "Westerhavenstraat",
    "Werkplaats Helperwestsingel": "Helper Westsingel",
    "U. Emmius singel": "Ubbo Emmiussingel",
    "St.-Walburgstraat": "Sint Walburgstraat",
    "Savoie Lohmanplein": "De Savornin Lohmanplein",
    "Rode Wees- huisstraat": "Rodeweeshuisstraat",
    "Rhijnv. Feithplein": "R. Feithplein",
    "Rabenhouthuisstraat": "Rabenhauptstraat",
    "Prof. Rankastraat": "Professor Rankestraat",
    "Prof H.C. v. Hallstraat": "Professor H.C. van Hallstraat",
    "Princessenweg": "Prinsesseweg",
    "Popkenstraatje": "Popkenstraat",
    "Pieter Hendrikzstraat": "Petrus Hendrikszstraat",
    "Pieter Hendriksstraat": "Petrus Hendrikszstraat",
    "Petroleum Campersingel": "Petrus Campersingel",
    "P.K. Woldijk": "Wolddijk",
    "Oudt Kijk-in-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "Oude Kijkin'tjatstraat": "Oude Kijk in 't Jatstraat",
    "Oude Kijk-in-'tJatstraat": "Oude Kijk in 't Jatstraat",
    "Oosterzijde Ebbingestraat": "Oude Ebbingestraat",
    "Ooster Weg": "Oosterweg",
    "Ooster Singel": "Oostersingel",
    "Ooster Kijk-in-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "Ooster Kijk-in-'s Jatstraat": "Oude Kijk in 't Jatstraat",
    "Ooster Kijk-in 't Jatstraat": "Oude Kijk in 't Jatstraat",
    "O.Kijk-in-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "O. in-'t Jatstraat": "Oude Kijk in 't Jatstraat",
    "O. Kijk-in-'t Jastraat": "Oude Kijk in 't Jatstraat",
    "O. Kijk-in't Jatstraat": "Oude Kijk in 't Jatstraat",
    "O. Ebbingstraat": "Oude Ebbingestraat",
    "O. Ebbin- gestraat": "Oude Ebbingestraat",
    "Nw. St.-Jansstraat": "Nieuwe Sint Jansstraat",
    "Nw. Kijk-in-'t Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "Noordzijde-binnensingel": "Noorderbinnensingel",
    "Noord-Stationstraat": "Noorderstationsstraat",
    "Noord-Buitensingel": "Noorderbuitensingel",
    "Noord Binnensingel": "Noorderbinnensingel",
    "Nieuwe Kijk-in- Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "N.stationstraat": "Noorderstationsstraat",
    "N. Kijk-in-'tJatstraat": "Nieuwe Kijk in 't Jatstraat",
    "N. Kijk in 't Jatstraat": "Nieuwe Kijk in 't Jatstraat",
    "N. Ebbingestraat": "Nieuwe Ebbingestraat",
    "Mr. Willem de Sitterstraat": "De Sitterstraat",
    "Mr. S.M. S. Modder-manlaan": "Moddermanlaan",
    "Mr. A.F. de Savornin Lohmanlaan": "De Savornin Lohmanlaan",
    "Mr. A.F. de Sav. Lohmanlaan": "De Savornin Lohmanlaan",
    "Meneer H. Goeman Borgesiuslaan": "Goeman Borgesiuslaan",
    "Martinus Kerkhof": "Martinikerkhof",
    "Magazijn Pel- sterstraat": "Pelsterstraat",
    "Lellestraat": "Leliestraat",
    "Le Hun- zestraat": "Eerste Hunzestraat",
    "Kantoor Petrus Hendrikzstraat": "Petrus Hendrikszstraat",
    "Kant. O. Ebbingestraat": "Oude Ebbingestraat",
    "Joh. W. Prisostraat": "Johan Willem Frisostraat",
    "In de Bat-tengang": "Battengang",
    "Hoornschdijk": "Hoornsedijk",
    "Hoogleraar Colleniusstraat": "Herman Colleniusstraat",
    "Hoenderkade": "Hoendiepskade",
    "Herenp.molendrift": "Herepoortenmolendrift",
    "Herebinsingel": "Herebinnensingel",
    "Hendrikzijnstraat": "Petrus Hendrikszstraat",
    "Hendrikzandstraat": "Petrus Hendrikszstraat",
    "Hendrikz.-straat": "Petrus Hendrikszstraat",
    "Hendrik Colleniusstraat": "Herman Colleniusstraat",
    "Helperwestraat": "Helper Weststraat",
    "Helperwestersingel": "Helper Westsingel",
    "Helperooster-singel": "Helper Oostsingel",
    "Helper-westsingel": "Helper Westsingel",
    "Heerweg": "Hereweg",
    "Grote gang": "Grote Gang",
    "Grote Kerk Elleboog": "Grote Kromme Elleboog",
    "Grootekade": "Dr. C. Hofstede de Grootkade",
    "Gr. Rozestraat": "Grote Rozenstraat",
    "Gerebranten Bakkerstraat": "Gerbrand Bakkerstraat",
    "Gedempte Kattenburgerdiep": "Gedempte Kattendiep",
    "Gedeeltelijk Kattendiep": "Gedempte Kattendiep",
    "Gebooren Bakkerstraat": "Gerbrand Bakkerstraat",
    "G. Kruisstraat": "Grote Kruisstraat",
    "Friese Sraatweg": "Friesestraatweg",
    "Eelderstraatweg": "Eelderstraat",
    "Dr. H.C. de Grootkade": "Dr. C. Hofstede de Grootkade",
    "De Withstraat": "Witte de Withstraat",
    "De Grootkade": "Dr. C. Hofstede de Grootkade",
    "De Drift": "1e Drift Ged. Zuiderdiep",
    "Damsterdijk": "Damsterdiep",
    "D. Huizingastraat": "Dirk Huizingastraat",
    "Anna Paulownalaan": "Anna Paulownastraat",
    "Achterkerkstraat": "Kerkstraat",
    "Achterkerkhof": "Akerkhof",
    "A. Paulouwnastraat": "Anna Paulownastraat",
    "4e Drift": "Vierde Drift Noorderhaven",
    "2e Willenstraat": "Tweede Willemstraat",
    "0. Kijk-in-'t Jatstraat": "Oude Kijk in 't Jatstraat",

    # === Missed Y decisions from claude-output TSV (round 2 dedup) ===
    "Jozef Israelsstraat": "Jozef Israëlsstraat",
    "Buiten Damsterdiep": "Damsterdiep",
    "2e Willemstraat": "Tweede Willemstraat",
    "Binnen Damsterdiep": "Damsterdiep",
    "Grote Raamstraat": "Raamstraat",
    "Jansstraat": "Nieuwe Sint Jansstraat",
    "Zuidersingelstraat": "Ubbo Emmiusstraat",
    "Molenstraat": "Helper Molenstraat",
    "Kruisstraat": "Grote Kruisstraat",
    "Mesdagstraat": "H.W. Mesdagstraat",
    "Veemarkt": "Veemarktstraat",
    "Kattendiep": "Gedempte Kattendiep",
    "1e Drift": "1e Drift Ged. Zuiderdiep",
    "2e Drift": "2e Drift Ged. Zuiderdiep",
    "Gr. Raamstraat": "Raamstraat",
    "Doctor C. Hofstede de Grootkade": "Dr. C. Hofstede de Grootkade",
    "Campersingel": "Petrus Campersingel",
    "Lage der A Dwarsstraat": "Dwarsstraat",
    "Kreupelstraatje": "Kreupelstraat",
    "Kl. Bergstraat": "Kleine Bergstraat",
    "Kromme Elleboog": "Grote Kromme Elleboog",
    "Badstraat": "Kleine Badstraat",
    "Amalia v. Solmsstraat": "Amalia van Solmsstraat",
    "Kl. Sophiastraat": "Kleine Sophiastraat",
    "Kl. Haddingestraat": "Kleine Haddingestraat",
    "Colleniusstraat": "Herman Colleniusstraat",
    "Kl. Pelsterstraat": "Kleine Pelsterstraat",
    "Frisostraat": "Johan Willem Frisostraat",
    "Rotterdammerstraat": "Rotterdammerstraatje",
    "Praedinius singel": "Praediniussingel",
    "Paulownastraat": "Anna Paulownastraat",
    "Jozef Israelsplein": "Jozef Israëlsplein",
    "Willem Barendsstraat": "Willem Barentzstraat",
    "Sint-Jansstraat": "Sint Jansstraat",
    "Noorder Stationstraat": "Noorderstationsstraat",
    "Kl. Raamstraat": "Kleine Raamstraat",
    "Joh. Willem Frisostraat": "Johan Willem Frisostraat",
    "Grootkade": "Dr. C. Hofstede de Grootkade",
    "Scholtenstraat": "W.A. Scholtenstraat",
    "Savornin Lohmanlaan": "De Savornin Lohmanlaan",
    "Rozenstraat": "Grote Rozenstraat",
    "Pottebakkerijge": "Pottebakkersrijge",
    "Ooster singel": "Oostersingel",
    "Lutkenieuwstraatje": "Lutkenieuwstraat",
    "Goorrechtkade": "Gorechtkade",
    "Van Speijkstraat": "Van Speykstraat",
    "Savornin Lohmanplein": "De Savornin Lohmanplein",
    "Pieter Heinstraat": "Piet Heinstraat",
    "Petrus Camper-singel": "Petrus Campersingel",
    "Noordhaven": "Noorderhaven",
    "Noorder Kerkstraat": "Noorderkerkstraat",
    "Kl. Steentilstraat": "Kleine Steentilstraat",
    "Kl. Peperstraat": "Kleine Peperstraat",
    "Israëlsstraat": "Jozef Israëlsstraat",
    "Ganzenvoortsingel": "Ganzevoortsingel",
    "Wal+C77": "Achter de Wal",
    "Sint Wal- burgstraat": "Sint Walburgstraat",
    "Siedemennerstraat": "Sledemennerstraat",
    "Reitdiep kade": "Reitdiepskade",
    "Prinsestraat": "Prinsenstraat",
    "Petrus Hendrikz.-straat": "Petrus Hendrikszstraat",
    "Petrus Hendrikszoonstraat": "Petrus Hendrikszstraat",
    "Petrus Hendriksz.-straat": "Petrus Hendrikszstraat",
    "Petersstraat": "C.H. Petersstraat",
    "Ooster-singel": "Oostersingel",
    "Noorderstationstraat": "Noorderstationsstraat",
    "Noorder Buitensingel": "Noorderbuitensingel",
    "Nassau-laan": "Nassaulaan",
    "N. Kerkstraat": "Noorderkerkstraat",
    "Moestraat": "Moesstraat",
    "Koninginlaan": "Koninginnelaan",
    "Kl. Gelkingestraat": "Kleine Gelkingestraat",
    "Jan Hissink Janssenstraat": "Jan Hissink Jansenstraat",
    "J. Goeverneurstraat": "Jan Goeverneurstraat",
    "Herebinnen- singel": "Herebinnensingel",
    "Hereb.singel": "Herebinnensingel",
    "Hallstraat": "Professor H.C. van Hallstraat",
    "Gedempte Boterdiep": "Boterdiep",
    "Ernst Casemirlaan": "Ernst Casimirlaan",
    "Emmiussingel": "Ubbo Emmiussingel",
    "D. Bosstraat": "Dr. D. Bosstraat",
    "Bosstraat": "Dr. D. Bosstraat",
    "'t Klooster (Butjesstraat)": "t Klooster",
    "Wichersstraat": "H.L. Wichersstraat",
    "Werkmanstraat": "H.N. Werkmanstraat",
    "Voormalige Stationsweg": "Stationsweg",
    "Verlengde H.L. Wichersstraat": "H.L. Wichersstraat",
    "Verlengde Frede-rikstraat": "Verlengde Frederikstraat",
    "Verl Hereweg": "Verlengde Hereweg",
    "Stationstraat": "Stationsstraat",
    "Sijsenstraat": "Van Sijsenstraat",
    "Rankestraat": "Professor Rankestraat",
    "Radebinnen-singel": "Radebinnensingel",
    "Professor Rankastraat": "Professor Rankestraat",
    "Praedinius-singel": "Praediniussingel",
    "Petrus Hendrikxstraat": "Petrus Hendrikszstraat",
    "Petr. Driessenstraat": "Petrus Driessenstraat",
    "Ossemarkt": "Ossenmarkt",
    "Noord-binnensingel": "Noorderbinnensingel",
    "Martini-kerkhof": "Martinikerkhof",
    "Markstraat": "Marktstraat",
    "Lopende diep": "Lopendediep",
    "Lage der-A Dwarsstraat": "Dwarsstraat",
    "Laan": "De Laan",
    "Konninginnelaan": "Koninginnelaan",
    "Koninginneslaan": "Koninginnelaan",
    "Kl. Grachtstraat": "Kleine Grachtstraat",
    "Joachim Althinghstraat": "Joachim Altinghstraat",
    "Herm. Collenisstraat": "Herman Colleniusstraat",
    "Herepoortenmolen- drift": "Herepoortenmolendrift",
    "Herebinnen-singel": "Herebinnensingel",
    "Here-singel": "Heresingel",
    "Here- plein": "Hereplein",
    "Helpermolenstraat": "Helper Molenstraat",
    "Guyotsplein": "Guyotplein",
    "Eendrachtkade": "Eendrachtskade",
    "Deli-plein": "Deliplein",
    "Br. Ruiterstraat": "Bruine Ruiterstraat",
    "Zwanenstraat": "Zwanestraat",
    "Zuider Kerkstraat": "Zuiderkerkstraat",
    "Winschoterdiep (houten hulpweg": "Winschoterdiep",
    "Wester-Badstraat": "Wester Badstraat",
    "Wester- havenstraat": "Westerhavenstraat",
    "Westenhavenstraat": "Westerhavenstraat",
    "Verlengde Vis-scherstraat": "Verlengde Visserstraat",
    "Verlengde Oostereweg": "Verlengde Oosterweg",
    "Verlengde Lode-wijkstraat": "Verlengde Lodewijkstraat",
    "Verlengde Fre- derikstraat": "Verlengde Frederikstraat",
    "Verl Lodewijkstraat": "Lodewijkstraat",
    "Veemarkstraat": "Veemarktstraat",
    "Vee- marktstraat": "Veemarktstraat",
    "Van Speyckstraat": "Van Speykstraat",
    "Van Julsinghaastraat": "Van Julsinghastraat",
    "V. v/m. Stationsweg": "Stationsweg",
    "Tuinbouw dwarsstraat": "Tuinbouwdwarsstraat",
    "Tasmanstraat": "Abel Tasmanstraat",
    "Sterreboschstraat": "Sterrebosstraat",
    "Steenstilstraat": "Steentilstraat",
    "Steen tilstraat": "Steentilstraat",
    "St Jansstraat": "Sint Jansstraat",
    "Spoorweg Joachim Altinghstraat": "Joachim Altinghstraat",
    "Spoorstraat": "Eerste Spoorstraat",
    "Soenstraat": "Soendastraat",
    "Snor Boterdiep": "Snor (Boterdiep)",
    "Sitterstraat": "De Sitterstraat",
    "Sint Wal-burgstraat": "Sint Walburgstraat",
    "Sint Janstraat": "Sint Jansstraat",
    "Sint Jans Straat": "Sint Jansstraat",
    "Selwerderdwstraat": "Selwerderstraat",
    "Schuitenmakerstraat": "Schuitemakersstraat",
    "Rotterdamse straatje": "Rotterdammerstraatje",
    "Rodeweesthuisstraat": "Rodeweeshuisstraat",
    "Rodewees- huisstraat": "Rodeweeshuisstraat",
    "Rode-weeshuisstraat": "Rodeweeshuisstraat",
    "Rode- weeshuisstraat": "Rodeweeshuisstraat",
    "Rode weeshuisstraat": "Rodeweeshuisstraat",
    "Rode Weeshuisstraat": "Rodeweeshuisstraat",
    "Ripperdalalaan": "Ripperdalaan",
    "Remmer Kleine Brandenburgerstraat": "Kleine Brandenburgerstraat",
    "Reitdiep": "Reitdiephaven",
    "Reinoutstraat": "Reinautstraat",
    "Radsingel": "Radesingel",
    "Radebroucksingel": "Radebinnensingel",
    "Radebinnesingel": "Radebinnensingel",
    "Rabenhaupstraat": "Rabenhauptstraat",
    "Prins Hendrikstraat": "Hendrikstraat",
    "Praediniusensingel": "Praediniussingel",
    "Polkingestraat": "Folkingestraat",
    "Poele straat": "Poelestraat",
    "Plansoenstraat": "Plantsoenstraat",
    "Piet Heinestraat": "Piet Heinstraat",
    "Petrus Hendrikzoonstraat": "Petrus Hendrikszstraat",
    "Petrus Hendrikstraat": "Petrus Hendrikszstraat",
    "Petr. Hendrikzstraat": "Petrus Hendrikszstraat",
    "Petr. Hendrikszstraat": "Petrus Hendrikszstraat",
    "Peizeweg": "Peizerweg",
    "Paulus Lamansstraat": "Paulus Lamanstraat",
    "Pakhuizen Oosterhavenstraat": "Oosterhavenstraat",
    "Pakhuis Taco Mesdagstraat": "Taco Mesdagstraat",
    "Pakhuis Aweg": "Aweg",
    "Oude Kijk-in-'t- Jatstraat": "Oude Kijk in 't Jatstraat",
    "Oraniestraat": "Oranjestraat",
    "Ooststraat": "Oosterstraat",
    "Oostersingel En Sint Jansstraat": "Oostersingel",
    "Ooster- singel": "Oostersingel",
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
