import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "_pipeline" / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


match_addresses = load_script("match_addresses")
geocode_addresses = load_script("geocode_addresses")


class StreetNormalizationTest(unittest.TestCase):
    def test_book_street_aliases_expand_to_modern_bag_names(self):
        examples = {
            "Musschengang": "mussengang",
            "Cortinglaan": "cortinghlaan",
            "H.L. Wicherstraat": "h l wichersstraat",
            "Driehovensteeg": "driehovenstraat",
            "J.W. Fristostraat": "johan willem frisostraat",
            "Frans Straatweg": "friesestraatweg",
            "Noorderstationstraat": "noorderstationsstraat",
            "L. Henriëttestraat": "louise henriettestraat",
            "Helperwestsingel": "helper westsingel",
            "Bleekerstraat": "blekerstraat",
            "Stationstraat": "stationsstraat",
            "Roodeweeshuisstraat": "rodeweeshuisstraat",
            "A-Kerkstraat": "akerkstraat",
            "Petrus Hendrikzstraat": "petrus hendrikszstraat",
            "Zaagmulderswegje": "zaagmuldersweg",
            "Loopendediep": "lopendediep",
            "Hoornsche dijk": "hoornsedijk",
            "Schuitemakerstraat": "schuitemakersstraat",
            "Sterreboschstraat": "sterrebosstraat",
            "Van Speijkstraat": "van speykstraat",
            "Van Julsingastraat": "van julsinghastraat",
            "Koninginelaan": "koninginnelaan",
            "J. Goeverneurstraat": "jan goeverneurstraat",
            "Tusschen beide Markten": "tussen beide markten",
            "U. Emmiussingel": "ubbo emmiussingel",
        }

        for historical, modern in examples.items():
            with self.subTest(historical=historical):
                self.assertIn(modern, match_addresses.expanded_streets(historical))

    def test_directional_side_markers_do_not_affect_matching(self):
        examples = {
            "Noorderhaven z.z.": "noorderhaven",
            "Oosterhaven Z.z.": "oosterhaven",
            "Hoendiep N.Z.": "hoendiep",
            "Schuitendiep oz": "schuitendiep",
            "Eendrachtskade W.Z.": "eendrachtskade",
        }

        for historical, base in examples.items():
            with self.subTest(historical=historical):
                self.assertIn(base, match_addresses.expanded_streets(historical))

    def test_pdok_query_aliases_include_bulk_ocr_corrections(self):
        examples = {
            "Musschengang 1": "mussengang 1",
            "Cortinglaan 1": "cortinghlaan 1",
            "J.W. Fristostraat 13": "johan willem frisostraat 13",
            "Noorderhaven z.z. 10": "noorderhaven 10",
            "Oosterhaven Z.z. 11": "oosterhaven 11",
        }

        for historical, expected in examples.items():
            with self.subTest(historical=historical):
                self.assertEqual(
                    expected,
                    geocode_addresses.normalize_query(historical.lower()),
                )


if __name__ == "__main__":
    unittest.main()
