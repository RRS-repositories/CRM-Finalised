#!/usr/bin/env python3
"""
Import Claims - FAST BATCH MODE
"""

import os
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

DB_HOST = os.getenv('DB_HOST', 'rowan-rose-solicitors-clients-list.cjme82cqwljz.eu-north-1.rds.amazonaws.com')
DB_NAME = os.getenv('DB_NAME', 'client_credentials')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'admin123')

EXCEL_FILE = 'public/CLAIMS .xlsx'
FAILED_FILE = 'failed.txt'


def main():
    print("=" * 60)
    print("CLAIMS IMPORT - FAST BATCH MODE")
    print("=" * 60)

    # Read Excel
    print(f"\nReading {EXCEL_FILE}...")
    df = pd.read_excel(EXCEL_FILE)
    total = len(df)
    print(f"Found {total} rows")

    # Connect
    print(f"\nConnecting...")
    conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASSWORD)
    cur = conn.cursor()

    # Add column if needed
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'cases' AND column_name = 'reference_specified'
    """)
    if not cur.fetchone():
        print("Adding reference_specified column...")
        cur.execute("ALTER TABLE cases ADD COLUMN reference_specified VARCHAR(50)")
        conn.commit()

    # Load contacts
    print("Loading contacts...")
    cur.execute("SELECT id, email, reference FROM contacts WHERE email IS NOT NULL")
    contacts = {}
    for cid, email, ref in cur.fetchall():
        if email:
            refs_set = set(r.strip() for r in (ref or '').split(',') if r.strip())
            contacts[email.lower().strip()] = {'id': cid, 'refs': refs_set}
    print(f"Loaded {len(contacts)} contacts")

    # Load existing
    print("Loading existing cases...")
    cur.execute("SELECT reference_specified FROM cases WHERE reference_specified IS NOT NULL")
    existing = set(str(r[0]) for r in cur.fetchall() if r[0])
    print(f"Found {len(existing)} existing")

    # Process - collect batches
    print(f"\nProcessing {total} rows...")
    to_insert = []
    failed_list = []
    skipped = 0

    for idx, row in df.iterrows():
        if (idx + 1) % 2000 == 0:
            print(f"  [{idx+1}/{total}] to_insert: {len(to_insert)}, failed: {len(failed_list)}")

        ref = str(row['Reference']).strip()
        lender = str(row['lender']).strip()
        email = str(row['Email']).strip().lower()

        if ref in existing:
            skipped += 1
            continue

        contact = contacts.get(email)
        if not contact:
            failed_list.append(f"{ref}\t{lender}\t{email}\tEmail not found")
            continue

        if ref not in contact['refs']:
            failed_list.append(f"{ref}\t{lender}\t{email}\tRef not in contact")
            continue

        to_insert.append((contact['id'], lender, 'LOA SIGNED', ref, False, 0))
        existing.add(ref)

    # Batch insert
    print(f"\nBatch inserting {len(to_insert)} cases...")
    if to_insert:
        execute_values(cur, """
            INSERT INTO cases (contact_id, lender, status, reference_specified, loa_generated, claim_value)
            VALUES %s
        """, to_insert, page_size=1000)
        conn.commit()
    print("Done!")

    # Write failed
    print(f"\nWriting {len(failed_list)} failed to {FAILED_FILE}...")
    with open(FAILED_FILE, 'w') as f:
        f.write("Reference\tLender\tEmail\tReason\n")
        for line in failed_list:
            f.write(line + '\n')

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("DONE!")
    print(f"Inserted: {len(to_insert)}")
    print(f"Skipped:  {skipped}")
    print(f"Failed:   {len(failed_list)}")
    print("=" * 60)


if __name__ == '__main__':
    main()
