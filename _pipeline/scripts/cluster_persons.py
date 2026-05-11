import sqlite3
import logging
from collections import defaultdict

log = logging.getLogger("cluster_persons")

def cluster(conn: sqlite3.Connection):
    """
    Groups entries into 'persons' based on shared attributes:
    1. Exact Name + Initials match AND (Exact Address OR Exact Occupation)
    """
    cur = conn.cursor()

    log.info("Clustering entries by person...")

    # 1. Create persons table and alter entries
    cur.execute("DROP TABLE IF EXISTS persons;")
    cur.execute("""
        CREATE TABLE persons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canonical_name TEXT,
            canonical_occupation TEXT,
            canonical_address TEXT,
            canonical_pand_id TEXT,
            entry_count INTEGER DEFAULT 0
        );
    """)

    # Add person_id to entries if not exists
    try:
        cur.execute("ALTER TABLE entries ADD COLUMN person_id INTEGER REFERENCES persons(id);")
    except sqlite3.OperationalError:
        # Column already exists (if running multiple times)
        pass

    cur.execute("CREATE INDEX IF NOT EXISTS idx_entries_person_id ON entries(person_id);")

    # 2. Fetch all entries with name and initials
    cur.execute("""
        SELECT id, name, initials, occupation_expanded, address_street_expanded, address_number, pand_id
        FROM entries
        WHERE name IS NOT NULL AND name != ''
          AND (entity_type IS NULL OR entity_type = '' OR entity_type = 'person')
    """)
    rows = cur.fetchall()

    # We will build clusters iteratively.
    # A cluster is a set of entry IDs.
    # Group by normalized (name, initials) first to reduce complexity.

    def norm(s):
        if not s: return ""
        # Remove punctuation, lowercase, strip spaces
        return ''.join(c.lower() for c in str(s) if c.isalnum())

    groups = defaultdict(list)
    for row in rows:
        eid, name, inits, occ, street, num, pand = row
        n_name = norm(name)
        n_inits = norm(inits)
        if not n_name: continue
        groups[(n_name, n_inits)].append(row)

    clusters = [] # list of lists of entry IDs

    for (n_name, n_inits), members in groups.items():
        if len(members) == 1:
            clusters.append([members[0][0]])
            continue

        # Within this group (same name + initials), we need to link members.
        # Two members link if they share an occupation, or share an address.
        # This is a graph connected-components problem.

        # Build adjacency list
        adj = {m[0]: set() for m in members}

        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                m1 = members[i]
                m2 = members[j]

                # Check for links
                linked = False

                # Link by Occupation
                occ1 = norm(m1[3])
                occ2 = norm(m2[3])
                if occ1 and occ2 and occ1 == occ2:
                    linked = True

                # Link by Address (Street + Number)
                street1 = norm(m1[4])
                street2 = norm(m2[4])
                num1 = norm(m1[5])
                num2 = norm(m2[5])
                if street1 and street2 and num1 and num2 and street1 == street2 and num1 == num2:
                    linked = True

                # Link by pand_id
                pand1 = m1[6]
                pand2 = m2[6]
                if pand1 and pand2 and pand1 == pand2:
                    linked = True

                if linked:
                    adj[m1[0]].add(m2[0])
                    adj[m2[0]].add(m1[0])

        # Find connected components
        visited = set()
        for m in members:
            eid = m[0]
            if eid not in visited:
                comp = []
                stack = [eid]
                while stack:
                    curr = stack.pop()
                    if curr not in visited:
                        visited.add(curr)
                        comp.append(curr)
                        stack.extend(adj[curr] - visited)
                clusters.append(comp)

    log.info(f"  Created {len(clusters)} person clusters from {len(rows)} named entries")

    # 3. Insert into persons table and update entries
    # To avoid many small transactions, we batch
    person_inserts = []
    entry_updates = []

    # We need a quick lookup to determine canonicals.
    # Just query again for the full data of these IDs.

    for comp in clusters:
        # For canonical values, we pick the most complete ones from the component.
        person_inserts.append((len(comp),)) # Just a placeholder, we'll get the ID via returning or auto-increment.

    # SQLite doesn't easily support RETURNING in executemany with full batching cleanly for this logic.
    # So we'll insert one by one or in chunks, fetching the IDs.

    person_id_map = {} # eid -> pid
    for comp in clusters:
        # Find best canonicals
        c_name, c_occ, c_addr, c_pand = None, None, None, None

        # We need the actual data to determine canonical. We can pull it from `rows` by making a dict.
        # But let's just query it.
        placeholders = ",".join("?" for _ in comp)
        cur.execute(f"""
            SELECT name, initials, name_prefix_expanded, occupation_expanded, address_full, pand_id
            FROM entries WHERE id IN ({placeholders})
        """, comp)

        comp_data = cur.fetchall()

        for d in comp_data:
            name, inits, prefix, occ, addr, pand = d

            # Best name
            full_name = " ".join(filter(None, [inits, prefix, name]))
            if not c_name or len(full_name) > len(c_name):
                c_name = full_name

            # Best occupation
            if occ and (not c_occ or len(occ) > len(c_occ)):
                c_occ = occ

            # Best address
            if addr and (not c_addr or len(addr) > len(c_addr)):
                c_addr = addr

            if pand and not c_pand:
                c_pand = pand

        cur.execute("""
            INSERT INTO persons (canonical_name, canonical_occupation, canonical_address, canonical_pand_id, entry_count)
            VALUES (?, ?, ?, ?, ?)
        """, (c_name, c_occ, c_addr, c_pand, len(comp)))

        pid = cur.lastrowid

        for eid in comp:
            entry_updates.append((pid, eid))

    # Update entries
    cur.executemany("UPDATE entries SET person_id = ? WHERE id = ?", entry_updates)

    conn.commit()
    log.info("Finished clustering.")
