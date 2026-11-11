"""Cross-check the 1854 occupation register against the book's own name index.

The "Alphabetische naamlijst" (scans 103-129) lists every name with the printed
pages it occurs on. Each index reference should be matched by a register entry
with that surname on that page, and vice versa. Mismatches are either a misread
(register or index) or a skipped line.

Usage:  ADRESBOEK_BOOK=1854 python scripts/check_index_1854.py
"""

import json
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.config import JSON_DIR, OUTPUT_DIR  # noqa: E402

REGISTER, INDEX = range(7, 103), range(103, 130)


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", (s or "").lower().replace("ij", "y"))


def main() -> None:
    register = defaultdict(list)  # printed page → surnames
    for n in REGISTER:
        page = json.loads((JSON_DIR / f"1769_19527-1854_{n:04d}.json").read_text(encoding="utf-8"))
        printed = 1 if n == 7 else n - 2  # the index calls the unnumbered first page "1"
        for occ in page.get("occupations") or []:
            for e in occ.get("entries") or []:
                register[printed].append(norm(e.get("name")))

    index = []  # (surname, page, raw line)
    for n in INDEX:
        page = json.loads((JSON_DIR / f"1769_19527-1854_{n:04d}.json").read_text(encoding="utf-8"))
        for line in (page.get("full_text") or "").splitlines():
            # The two index columns are often merged on one line: "Name 15, 16. Other 1, 53."
            for m in re.finditer(r"([^\d]+?)\s*((?:\d{1,3}\s*[,.]?\s*)+)", line):
                raw = m.group(0).strip()
                surname = norm(re.split(r"[,&]| en | Jr| Hz| Az| Jz| Nz", m.group(1).strip())[0])
                for p in re.findall(r"\d+", m.group(2)):
                    index.append((surname, int(p), raw))

    def has(names, surname):
        return any(surname == x or (surname[:4] == x[:4] and SequenceMatcher(None, surname, x).ratio() > 0.8) for x in names)

    missing = [(s, p, raw) for s, p, raw in index if s and not has(register.get(p, []), s)]
    by_page = defaultdict(set)
    for s, p, _ in index:
        by_page[p].add(s)
    extra = [(s, p) for p, names in register.items() for s in names if s and not has(by_page.get(p, ()), s)]

    out = OUTPUT_DIR / "index_check.txt"
    out.write_text(
        f"index references: {len(index)}, register entries: {sum(map(len, register.values()))}\n"
        f"in index, not found in register: {len(missing)}\n" + "".join(f"  p{p:<4}{raw}\n" for _, p, raw in sorted(missing, key=lambda x: x[1]))
        + f"in register, not found in index: {len(extra)}\n" + "".join(f"  p{p:<4}{s}\n" for s, p in sorted(extra, key=lambda x: x[1])),
        encoding="utf-8",
    )
    print(out.read_text(encoding="utf-8")[:3500])


if __name__ == "__main__":
    main()
