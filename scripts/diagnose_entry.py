import sqlite3
import os
import json

db_path = os.environ.get("DB_PATH", "data/adresboek.sqlite")
stable_id = "page-0435:10" # Example, I'll need to find the actual one for Praediniussingel 39a

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Find the entry by address search to get the stable_id
cur.execute("SELECT stable_id, name, address_full, address_street_expanded, person_id, searchable_text FROM entries WHERE address_full LIKE '%Praediniussingel 39a%'")
rows = cur.fetchall()

print(f"--- Database Entries for 'Praediniussingel 39a' ---")
for row in rows:
    print(dict(row))
    sid = row['stable_id']
    # Check FTS index for this row
    cur.execute("SELECT * FROM entries_fts WHERE rowid = (SELECT id FROM entries WHERE stable_id = ?)", (sid,))
    fts_row = cur.fetchone()
    print(f"FTS Index content for {sid}:")
    if fts_row:
        print(dict(fts_row))
    else:
        print("NOT FOUND IN FTS INDEX!")

conn.close()
