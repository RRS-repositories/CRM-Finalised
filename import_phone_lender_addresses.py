#!/usr/bin/env python3
"""
Import phone, extra_lenders, and previous_addresses from CONTACTED_NEW_FINAL_CLEANED (1).xlsx

Matches by Reference → finds contact → updates phone, extra_lenders, previous_addresses
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
EXCEL_FILE = './public/CONTACTED_NEW_FINAL_CLEANED (1).xlsx'
LOG_FILE = os.path.expanduser('~/Desktop/import_phone_lender_addresses.log')

# TEST MODE: Set to None for all rows, or a number to limit
TEST_LIMIT = None


def clean_text(val):
    """Clean text value, return None if NaN/empty"""
    if pd.isna(val) or str(val).strip() == '' or str(val).strip().lower() == 'nan':
        return None
    return str(val).strip()


def clean_phone(val):
    """Clean phone number - convert float to string, remove .0"""
    if pd.isna(val):
        return None
    # Convert to string and remove decimal
    phone_str = str(val).strip()
    if phone_str.endswith('.0'):
        phone_str = phone_str[:-2]
    if phone_str == '' or phone_str.lower() == 'nan':
        return None
    return phone_str


def clean_reference(val):
    """Clean reference - convert float to int string"""
    if pd.isna(val):
        return None
    # Convert to string and remove decimal
    ref_str = str(val).strip()
    if ref_str.endswith('.0'):
        ref_str = ref_str[:-2]
    if ref_str == '' or ref_str.lower() == 'nan':
        return None
    return ref_str


def extract_addresses(row):
    """Extract all previous addresses (1-3) from a row"""
    addresses = []
    for i in range(1, 4):  # Previous Address 1-3
        first_line = clean_text(row.get(f'Previous Address {i} - First Line'))
        town = clean_text(row.get(f'Previous Address {i} - Town'))
        postcode = clean_text(row.get(f'Previous Address {i} - Postcode'))

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
    print("IMPORT PHONE, EXTRA LENDERS & ADDRESSES FROM EXCEL")
    print("=" * 60)

    # Read Excel file
    print("\n[1] Reading Excel file...", flush=True)
    df = pd.read_excel(EXCEL_FILE)
    print(f"    Raw rows in Excel: {len(df)}", flush=True)

    # Filter out empty rows (no Reference = no data)
    df = df[df['Reference'].notna()]
    print(f"    Rows with data: {len(df)}", flush=True)

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
    cur.execute("SELECT id, reference, phone, extra_lenders, previous_addresses FROM contacts WHERE reference IS NOT NULL AND reference != ''")
    contacts_data = cur.fetchall()

    ref_to_contact = {}
    for contact_id, reference, phone, extra_lenders, prev_addresses in contacts_data:
        # Split comma-separated references
        refs = [r.strip() for r in reference.split(',') if r.strip()]
        for ref in refs:
            ref_to_contact[ref] = {
                'id': contact_id,
                'phone': phone,
                'extra_lenders': extra_lenders,
                'previous_addresses': prev_addresses or []
            }

    print(f"    Loaded {len(ref_to_contact)} reference mappings from {len(contacts_data)} contacts", flush=True)

    # Process rows
    print("\n[4] Processing rows...", flush=True)

    updates = []  # List of updates to make
    matched = 0
    not_found = 0
    no_data = 0
    logs = []

    for idx, row in df.iterrows():
        reference = clean_reference(row.get('Reference'))

        if not reference:
            logs.append(f"[SKIP] Row {idx}: No reference")
            continue

        # Find contact by reference
        if reference not in ref_to_contact:
            logs.append(f"[NOT_FOUND] Row {idx}: Reference {reference} not found in contacts")
            not_found += 1
            continue

        contact = ref_to_contact[reference]
        contact_id = contact['id']

        # Extract data
        phone = clean_phone(row.get('phone'))
        extra_lender = clean_text(row.get('EXTRA LENDER'))
        addresses = extract_addresses(row)

        # Check if we have any data to update
        if not phone and not extra_lender and not addresses:
            logs.append(f"[SKIP] Row {idx}: Reference {reference} - no data to update")
            no_data += 1
            continue

        matched += 1

        # Merge previous_addresses (no duplicates)
        existing_addresses = contact['previous_addresses'] if isinstance(contact['previous_addresses'], list) else []
        existing_keys = set()
        for addr in existing_addresses:
            key = (addr.get('address_line_1', ''), addr.get('city', ''), addr.get('postal_code', ''))
            existing_keys.add(key)

        merged_addresses = existing_addresses.copy()
        for addr in addresses:
            key = (addr.get('address_line_1', ''), addr.get('city', ''), addr.get('postal_code', ''))
            if key not in existing_keys:
                merged_addresses.append(addr)
                existing_keys.add(key)

        updates.append({
            'contact_id': contact_id,
            'reference': reference,
            'phone': phone,
            'extra_lenders': extra_lender,
            'previous_addresses': merged_addresses if addresses else None
        })

        logs.append(f"[MATCH] Row {idx}: Reference {reference} -> Contact {contact_id}")
        if phone:
            logs.append(f"        Phone: {phone}")
        if extra_lender:
            logs.append(f"        Extra Lender: {extra_lender[:50]}...")
        if addresses:
            logs.append(f"        Addresses: {len(addresses)} new address(es)")

    print(f"\n    Final: Processed {total_rows} rows", flush=True)
    print(f"    Matched: {matched}", flush=True)
    print(f"    Reference Not Found: {not_found}", flush=True)
    print(f"    No Data to Update: {no_data}", flush=True)

    # Apply updates using BULK approach
    if updates:
        print(f"\n[5] Updating {len(updates)} contacts (BULK MODE)...", flush=True)

        from psycopg2.extras import execute_batch

        # Separate updates by type for bulk processing
        phone_updates = [(upd['phone'], upd['contact_id']) for upd in updates if upd['phone']]
        lender_updates = [(upd['extra_lenders'], upd['contact_id']) for upd in updates if upd['extra_lenders']]
        addr_updates = [(json.dumps(upd['previous_addresses']), upd['contact_id']) for upd in updates if upd['previous_addresses']]

        try:
            # Bulk update phones
            if phone_updates:
                print(f"    Updating {len(phone_updates)} phone numbers...", flush=True)
                execute_batch(cur, "UPDATE contacts SET phone = %s WHERE id = %s", phone_updates, page_size=1000)
                conn.commit()
                print(f"    Phones done!", flush=True)

            # Bulk update extra_lenders
            if lender_updates:
                print(f"    Updating {len(lender_updates)} extra_lenders...", flush=True)
                execute_batch(cur, "UPDATE contacts SET extra_lenders = %s WHERE id = %s", lender_updates, page_size=1000)
                conn.commit()
                print(f"    Extra lenders done!", flush=True)

            # Bulk update previous_addresses
            if addr_updates:
                print(f"    Updating {len(addr_updates)} previous_addresses...", flush=True)
                execute_batch(cur, "UPDATE contacts SET previous_addresses = %s WHERE id = %s", addr_updates, page_size=1000)
                conn.commit()
                print(f"    Addresses done!", flush=True)

            updated = len(updates)

        except Exception as e:
            logs.append(f"[ERROR] Bulk update failed: {str(e)}")

        conn.commit()
        print(f"    Total updated: {updated} contacts", flush=True)

    # Write log
    print(f"\n[6] Writing log file...", flush=True)
    with open(LOG_FILE, 'w') as f:
        f.write(f"Import Phone/Lender/Addresses Log - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 80 + "\n")
        f.write(f"Total rows: {total_rows}\n")
        f.write(f"Matched: {matched}\n")
        f.write(f"Not Found: {not_found}\n")
        f.write(f"No Data: {no_data}\n")
        f.write(f"Contacts Updated: {len(updates)}\n")
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
