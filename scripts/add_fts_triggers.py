#!/usr/bin/env python3
import sqlite3
import os

db_path = os.environ.get("DB_PATH", "data/adresboek.sqlite")
print(f"Connecting to {db_path}...")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

SCHEMA_TRIGGERS = """
-- FTS5 triggers to keep entries_fts in sync with entries
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, name, initials, name_prefix_expanded, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES (new.id, new.name, new.initials, new.name_prefix_expanded, new.occupation, new.occupation_expanded, new.address_street, new.address_street_expanded, new.address_number, new.address_full, new.searchable_text);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, initials, name_prefix_expanded, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES ('delete', old.id, old.name, old.initials, old.name_prefix_expanded, old.occupation, old.occupation_expanded, old.address_street, old.address_street_expanded, old.address_number, old.address_full, old.searchable_text);
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, initials, name_prefix_expanded, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES ('delete', old.id, old.name, old.initials, old.name_prefix_expanded, old.occupation, old.occupation_expanded, old.address_street, old.address_street_expanded, old.address_number, old.address_full, old.searchable_text);
  INSERT INTO entries_fts(rowid, name, initials, name_prefix_expanded, occupation, occupation_expanded, address_street, address_street_expanded, address_number, address_full, searchable_text)
  VALUES (new.id, new.name, new.initials, new.name_prefix_expanded, new.occupation, new.occupation_expanded, new.address_street, new.address_street_expanded, new.address_number, new.address_full, new.searchable_text);
END;
"""

print("Adding triggers...")
try:
    cur.executescript(SCHEMA_TRIGGERS)
    print("Rebuilding index one last time...")
    cur.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
    conn.commit()
    print("Success!")
except Exception as e:
    print(f"Failed: {e}")
finally:
    conn.close()
