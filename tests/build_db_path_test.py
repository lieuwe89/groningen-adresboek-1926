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


if __name__ == "__main__":
    unittest.main()
