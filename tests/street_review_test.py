import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "_pipeline"))
spec = importlib.util.spec_from_file_location("apply_omnummering", ROOT / "_pipeline" / "scripts" / "apply_omnummering.py")
apply_omnummering = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(apply_omnummering)

HEADER = "review,voorstel,zekerheid,straat_in_boek,wijk,straat_grunnlink,onderbouwing\n"


class StreetReviewTest(unittest.TestCase):
    def rejected(self, *rows: str) -> set:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "straatreview.csv"
            p.write_text(HEADER + "".join(r + "\n" for r in rows), encoding="utf-8")
            return apply_omnummering.street_rejected(p)

    def test_verdict_n_rejects(self):
        self.assertEqual({("A", "O", "B")}, self.rejected("N,N,hoog,A,O,B,Vermoedelijk een verkeerd nummer."))

    def test_open_low_proposal_rejects(self):
        self.assertEqual({("A", "Z", "B")}, self.rejected("?,Y,laag,A,Z,B,Plaatsaanduiding."))

    def test_grunnlink_changed_since_verdict_goes_first(self):
        stale = apply_omnummering.STALE_PREFIX + " dan toen je oordeelde. Vermoedelijk een verkeerd nummer."
        self.assertEqual(set(), self.rejected(f'N,N,hoog,A,O,B,"{stale}"', f'?,Y,laag,C,Z,D,"{stale}"'))


if __name__ == "__main__":
    unittest.main()
