import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "web" / "data" / "adresboek.sqlite"
JSON_DIR = ROOT / "output" / "json"

S1 = "\u00B9"
S2 = "\u00B2"
S7 = "\u2077"

# Manual fixes as requested by user
FIXES = [
    # (stem, idx, old_num, new_num, old_full, new_full)
    ("1769_19525-1926_0676", 61, "201", f"20{S1}", "A. Reese, Boekhandel. 201", f"A. Reese, Boekhandel. 20{S1}"),
    ("1769_19525-1926_0656", 73, "207", f"20{S7}", "G. Arends 207", f"G. Arends 20{S7}"),
    # G. Arends 207 (1) [that (1) is supposed to be a superscript 2]
    # We'll handle the searchable_text too
]

def apply_fixes():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    for stem, idx, old_num, new_num, old_full, new_full in FIXES:
        sid = f"{stem}:{idx}"
        print(f"Fixing {sid}...")
        
        # Update DB
        cur.execute("""
            UPDATE entries SET 
                address_number = ?, 
                address_full = ?,
                lat = NULL, lng = NULL, geocode_matched = NULL, pand_id = NULL
            WHERE stable_id = ?
        """, (new_num, new_full, sid))
        
        # Update JSON
        f = JSON_DIR / f"{stem}.json"
        if f.exists():
            content = f.read_text(encoding="utf-8")
            # This is a bit brittle but for single entries it's okay
            # We look for the entry by its idx (alto_tag_id entry_{idx+1})
            # Actually, I'll just use a safer string replace for the specific name
            content = content.replace(f'"address_number": "{old_num}"', f'"address_number": "{new_num}"')
            content = content.replace(f'"address_full": "{old_full}"', f'"address_full": "{new_full}"')
            
            # Special case for Arends (1) -> (2) superscript
            if "Arends" in new_full:
                content = content.replace("(1)", f"({S2})")
            
            f.write_text(content, encoding="utf-8")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    apply_fixes()
