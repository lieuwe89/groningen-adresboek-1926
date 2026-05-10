import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_DB_PATH = ROOT / "_pipeline" / "scripts" / "build_db.py"


spec = importlib.util.spec_from_file_location("build_db", BUILD_DB_PATH)
build_db = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(build_db)


class BuildDbPathTest(unittest.TestCase):
    def test_display_path_handles_project_level_data_directory(self):
        db_path = ROOT / "data" / "adresboek.sqlite"

        self.assertEqual("data/adresboek.sqlite", build_db.display_path(db_path))

    def test_correct_entry_address_updates_display_fields(self):
        entry = {
            "address_street": "Musschengang",
            "address_street_expanded": "Musschengang",
            "address_number": "14",
            "address_full": "Musschengang 14",
        }

        corrected = build_db.correct_entry_address(entry)

        self.assertEqual("Mussengang", corrected["address_street"])
        self.assertEqual("Mussengang", corrected["address_street_expanded"])
        self.assertEqual("Mussengang 14", corrected["address_full"])

    def test_correct_entry_address_strips_side_markers_from_display_fields(self):
        entry = {
            "address_street": "Noorderhaven z.z.",
            "address_street_expanded": "Noorderhaven z.z.",
            "address_number": "10",
            "address_full": "Noorderhaven z.z. 10",
        }

        corrected = build_db.correct_entry_address(entry)

        self.assertEqual("Noorderhaven", corrected["address_street"])
        self.assertEqual("Noorderhaven", corrected["address_street_expanded"])
        self.assertEqual("Noorderhaven 10", corrected["address_full"])

    def test_correct_entry_address_expands_n_ebbingestraat_to_nieuwe(self):
        for variant in (
            "N. Ebbingestraat",
            "Noordzijde Ebbingestraat",
            "Noord-Ebbingestraat",
        ):
            with self.subTest(variant=variant):
                entry = {
                    "address_street": "N. Ebbingestraat",
                    "address_street_expanded": variant,
                    "address_number": "32",
                    "address_full": f"{variant} 32",
                }

                corrected = build_db.correct_entry_address(entry)

                self.assertEqual("Nieuwe Ebbingestraat", corrected["address_street"])
                self.assertEqual("Nieuwe Ebbingestraat", corrected["address_street_expanded"])
                self.assertEqual("Nieuwe Ebbingestraat 32", corrected["address_full"])

    def test_correct_entry_address_updates_raw_n_ebbingestraat_when_expanded_is_already_correct(self):
        entry = {
            "address_street": "N. Ebbingestr.",
            "address_street_expanded": "Nieuwe Ebbingestraat",
            "address_number": "91",
            "address_full": "Nieuwe Ebbingestraat 91",
        }

        corrected = build_db.correct_entry_address(entry)

        self.assertEqual("Nieuwe Ebbingestraat", corrected["address_street"])
        self.assertEqual("Nieuwe Ebbingestraat", corrected["address_street_expanded"])
        self.assertEqual("Nieuwe Ebbingestraat 91", corrected["address_full"])

    def test_correct_entry_address_updates_embedded_n_ebbingestraat_mentions(self):
        entry = {
            "address_street": "Oosterstraat, N. Ebbingestraat, Brugstraat",
            "address_street_expanded": "Oosterstraat, N. Ebbingestraat, Brugstraat",
            "address_number": "Loopt van N. Ebbingestraat tot Ged. Boterdiep.",
            "address_full": (
                "Oosterstraat, N. Ebbingestraat, Brugstraat "
                "Loopt van N. Ebbingestraat tot Ged. Boterdiep."
            ),
        }

        corrected = build_db.correct_entry_address(entry)

        self.assertEqual(
            "Oosterstraat, Nieuwe Ebbingestraat, Brugstraat",
            corrected["address_street"],
        )
        self.assertEqual(
            "Oosterstraat, Nieuwe Ebbingestraat, Brugstraat",
            corrected["address_street_expanded"],
        )
        self.assertEqual(
            "Loopt van Nieuwe Ebbingestraat tot Ged. Boterdiep.",
            corrected["address_number"],
        )
        self.assertEqual(
            (
                "Oosterstraat, Nieuwe Ebbingestraat, Brugstraat "
                "Loopt van Nieuwe Ebbingestraat tot Ged. Boterdiep."
            ),
            corrected["address_full"],
        )

    def test_correct_entry_address_preserves_extra_address_full_text_for_n_ebbingestraat(self):
        entry = {
            "address_street": "N. Ebbingestraat",
            "address_street_expanded": "Noordzijde Ebbingestraat",
            "address_number": "32",
            "address_full": "Noordzijde Ebbingestraat 32 (boven)",
        }

        corrected = build_db.correct_entry_address(entry)

        self.assertEqual("Nieuwe Ebbingestraat 32 (boven)", corrected["address_full"])

    def test_correct_entry_address_ignores_non_string_address_number(self):
        entry = {
            "address_street": "N. Ebbingestraat",
            "address_street_expanded": "Nieuwe Ebbingestraat",
            "address_number": 91,
            "address_full": "Nieuwe Ebbingestraat 91",
        }

        corrected = build_db.correct_entry_address(entry)

        self.assertEqual(91, corrected["address_number"])
        self.assertEqual("Nieuwe Ebbingestraat 91", corrected["address_full"])


if __name__ == "__main__":
    unittest.main()
