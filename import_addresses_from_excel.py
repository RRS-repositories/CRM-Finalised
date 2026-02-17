#!/usr/bin/env python3
"""
Import previous addresses from Addresses_Parsed.xlsx.

Matches by Reference → finds contact → pushes previous_addresses JSONB (no duplicates).
"""

import pandas as pd
import psycopg2
import json
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection
DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT', 5432)
}

# File path
EXCEL_FILE = './public/Addresses_Parsed.xlsx'
LOG_FILE = os.path.expanduser('~/Desktop/import_addresses.log')

# TEST MODE: Set to None for all rows, or a number to limit
TEST_LIMIT = 5


def clean_text(val):
    """Clean text value, return None if NaN/empty"""
    if pd.isna(val) or str(val).strip() == '' or str(val).strip().lower() == 'nan':
        return None
    return str(val).strip()


def extract_addresses(row):
    """Extract all addresses (1-11) from a row"""
    addresses = []
    for i in range(1, 12):
        first_line = clean_text(row.get(f'Address {i} - First Line'))
        town = clean_text(row.get(f'Address {i} - Town'))
        postcode = clean_text(row.get(f'Address {i} - Postcode'))

        # Only add if at least one field has data
        if any([first_line, town, postcode]):
            addresses.append({
                'address_line_1': first_line or '',
                'city': town or '',
                'county': '',
                'postal_code': postcode or ''
            })
    return addresses


def main():
    print("=" * 60)
    print("IMPORT ADDRESSES FROM EXCEL")
    print("=" * 60)

    # Read Excel file
    print("\n[1] Reading Excel file...", flush=True)
    df = pd.read_excel(EXCEL_FILE)

    if TEST_LIMIT:
        df = df.head(TEST_LIMIT)
        print(f"    TEST MODE: Limited to first {TEST_LIMIT} rows", flush=True)

    total_rows = len(df)
    print(f"    Total rows to process: {total_rows}", flush=True)

    # Connect to database
    print("\n[2] Connecting to database...", flush=True)
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    print("    Connected!", flush=True)

    # Build reference -> contact lookup
    print("\n[3] Loading contacts and building reference map...", flush=True)
    cur.execute("SELECT id, reference, previous_addresses FROM contacts WHERE reference IS NOT NULL AND reference != ''")
    contacts_data = cur.fetchall()

    ref_to_contact = {}
    for contact_id, reference, prev_addresses in contacts_data:
        # Split comma-separated references
        refs = [r.strip() for r in reference.split(',') if r.strip()]
        for ref in refs:
            ref_to_contact[ref] = {
                'id': contact_id,
                'previous_addresses': prev_addresses or []
            }

    print(f"    Loaded {len(ref_to_contact)} reference mappings from {len(contacts_data)} contacts", flush=True)

    # Process rows
    print("\n[4] Processing rows...", flush=True)

    contacts_to_update = {}  # contact_id -> merged addresses
    matched = 0
    not_found = 0
    no_addresses = 0
    logs = []

    for idx, row in df.iterrows():
        reference = clean_text(row.get('Reference'))

        if not reference:
            logs.append(f"[SKIP] Row {idx}: No reference")
            continue

        # Find contact by reference
        if reference not in ref_to_contact:
            logs.append(f"[NOT_FOUND] Reference: {reference}")
            not_found += 1
            continue

        contact = ref_to_contact[reference]
        contact_id = contact['id']

        # Extract addresses from this row
        new_addresses = extract_addresses(row)

        if not new_addresses:
            no_addresses += 1
            continue

        matched += 1

        # Merge addresses for this contact
        if contact_id not in contacts_to_update:
            existing = contact['previous_addresses'] if isinstance(contact['previous_addresses'], list) else []
            contacts_to_update[contact_id] = {
                'addresses': existing.copy(),
                'keys': set()
            }
            # Build existing keys
            for addr in existing:
                key = (addr.get('address_line_1', ''), addr.get('city', ''), addr.get('postal_code', ''))
                contacts_to_update[contact_id]['keys'].add(key)

        # Add new addresses (no duplicates)
        for addr in new_addresses:
            key = (addr.get('address_line_1', ''), addr.get('city', ''), addr.get('postal_code', ''))
            if key not in contacts_to_update[contact_id]['keys']:
                contacts_to_update[contact_id]['addresses'].append(addr)
                contacts_to_update[contact_id]['keys'].add(key)
                logs.append(f"[ADD] Contact {contact_id}: {addr['address_line_1']}, {addr['city']}, {addr['postal_code']}")

        # Print progress every 500
        processed = idx + 1
        if processed % 500 == 0:
            print(f"    Processed {processed}/{total_rows} rows... (Matched: {matched})", flush=True)

    print(f"\n    Final: Processed {total_rows} rows", flush=True)
    print(f"    Matched: {matched}", flush=True)
    print(f"    Reference Not Found: {not_found}", flush=True)
    print(f"    No Addresses in Row: {no_addresses}", flush=True)
    print(f"    Contacts to Update: {len(contacts_to_update)}", flush=True)

    # Update contacts
    if contacts_to_update:
        print(f"\n[5] Updating {len(contacts_to_update)} contacts...", flush=True)

        updated = 0
        for i, (contact_id, data) in enumerate(contacts_to_update.items()):
            try:
                # Get first address for individual columns (if not already set)
                first_addr = data['addresses'][0] if data['addresses'] else None

                if first_addr:
                    cur.execute("""
                        UPDATE contacts
                        SET previous_addresses = %s,
                            previous_address_line_1 = COALESCE(previous_address_line_1, %s),
                            previous_city = COALESCE(previous_city, %s),
                            previous_county = COALESCE(previous_county, %s),
                            previous_postal_code = COALESCE(previous_postal_code, %s)
                        WHERE id = %s
                    """, [
                        json.dumps(data['addresses']),
                        first_addr['address_line_1'],
                        first_addr['city'],
                        first_addr['county'],
                        first_addr['postal_code'],
                        contact_id
                    ])
                else:
                    cur.execute("""
                        UPDATE contacts
                        SET previous_addresses = %s
                        WHERE id = %s
                    """, [json.dumps(data['addresses']), contact_id])

                updated += 1

                if (i + 1) % 100 == 0:
                    conn.commit()
                    print(f"    Updated {i + 1}/{len(contacts_to_update)} contacts", flush=True)

            except Exception as e:
                logs.append(f"[ERROR] Contact {contact_id}: {str(e)}")

        conn.commit()
        print(f"    Total updated: {updated} contacts", flush=True)

    # Write log
    print(f"\n[6] Writing log file...", flush=True)
    with open(LOG_FILE, 'w') as f:
        f.write(f"Import Addresses Log - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 80 + "\n")
        f.write(f"Total rows: {total_rows}\n")
        f.write(f"Matched: {matched}\n")
        f.write(f"Not Found: {not_found}\n")
        f.write(f"Contacts Updated: {len(contacts_to_update)}\n")
        f.write("=" * 80 + "\n\n")
        for log in logs:
            f.write(log + "\n")
    print(f"    Log saved to: {LOG_FILE}", flush=True)

    # Close connection
    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == '__main__':
    main()
