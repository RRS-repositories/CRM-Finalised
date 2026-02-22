#!/usr/bin/env python3
"""
Copy contacts to leads table based on Excel Reference matching.

- Match Excel Reference → contacts.reference
- Copy: first_name, last_name, phone, email, dob, extra_lenders, ip_address, address, previous_addresses
- Lender from Excel (merge multiple lenders for same person)
- extra_lender from contacts (already pushed from Excel)
- Status = 'awaiting_call'
- Dedupe: first_name + last_name + email + dob (merge lenders instead of skip)
"""

import pandas as pd
import psycopg2
import json
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT', 5432)
}

EXCEL_FILE = './public/CONTACTED_NEW_FINAL_CLEANED (1).xlsx'
LOG_FILE = os.path.expanduser('~/Desktop/copy_contacts_to_leads.log')

# TEST MODE: Set to None for all rows, or a number to limit
TEST_LIMIT = None


def clean_text(val):
    if pd.isna(val) or str(val).strip() == '' or str(val).strip().lower() == 'nan':
        return None
    return str(val).strip()


def clean_reference(val):
    if pd.isna(val):
        return None
    ref_str = str(val).strip()
    if ref_str.endswith('.0'):
        ref_str = ref_str[:-2]
    if ref_str == '' or ref_str.lower() == 'nan':
        return None
    return ref_str


def merge_lenders(existing, new):
    """Merge lenders, avoiding duplicates"""
    if not existing:
        return new if new else ''
    if not new:
        return existing

    existing_set = set(l.strip() for l in existing.split(',') if l.strip())
    new_clean = new.strip()

    if new_clean and new_clean not in existing_set:
        existing_set.add(new_clean)

    return ','.join(sorted(existing_set))


def main():
    print("=" * 60)
    print("COPY CONTACTS TO LEADS (MERGE LENDERS)")
    print("=" * 60)

    # Read Excel
    print("\n[1] Reading Excel file...", flush=True)
    df = pd.read_excel(EXCEL_FILE)
    df = df[df['Reference'].notna()]
    print(f"    Rows with data: {len(df)}", flush=True)

    if TEST_LIMIT:
        df = df.head(TEST_LIMIT)
        print(f"    TEST MODE: Limited to first {TEST_LIMIT} rows", flush=True)

    total_rows = len(df)
    print(f"    Total rows to process: {total_rows}", flush=True)

    # Connect to DB
    print("\n[2] Connecting to database...", flush=True)
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    print("    Connected!", flush=True)

    # Build reference -> contact lookup
    print("\n[3] Loading contacts...", flush=True)
    cur.execute("""
        SELECT id, reference, first_name, last_name, phone, email, dob,
               extra_lenders, ip_address, address_line_1, city, state_county, postal_code,
               previous_addresses
        FROM contacts
        WHERE reference IS NOT NULL AND reference != ''
    """)
    contacts_data = cur.fetchall()

    ref_to_contact = {}
    for row in contacts_data:
        (cid, reference, first_name, last_name, phone, email, dob,
         extra_lenders, ip_address, addr1, city, county, postal, prev_addr) = row

        refs = [r.strip() for r in reference.split(',') if r.strip()]

        # Convert current address to leads format
        current_addr = None
        if addr1:
            current_addr = {
                'street': addr1 or '',
                'city': city or '',
                'province': county or '',  # county → province in leads
                'postalCode': postal or ''
            }

        # Convert previous_addresses from contacts format to leads format
        converted_prev = []
        if prev_addr and isinstance(prev_addr, list):
            for pa in prev_addr:
                converted_prev.append({
                    'street': pa.get('address_line_1', '') or '',
                    'city': pa.get('city', '') or '',
                    'province': pa.get('county', '') or '',  # county → province
                    'postalCode': pa.get('postal_code', '') or ''
                })

        for ref in refs:
            ref_to_contact[ref] = {
                'id': cid,
                'first_name': first_name,
                'last_name': last_name,
                'phone': phone,
                'email': email,
                'dob': dob,
                'extra_lenders': extra_lenders,
                'ip_address': ip_address,
                'address': current_addr,
                'previous_addresses': converted_prev
            }

    print(f"    Loaded {len(ref_to_contact)} reference mappings", flush=True)

    # Load existing leads for dedupe check (with their IDs for updating)
    print("\n[4] Loading existing leads...", flush=True)
    cur.execute("""
        SELECT id, LOWER(COALESCE(first_name, '')), LOWER(COALESCE(last_name, '')),
               LOWER(COALESCE(email, '')), dob, lender
        FROM leads
    """)
    existing_leads = {}  # dedupe_key -> {id, lender}
    for row in cur.fetchall():
        lead_id, fn, ln, em, dob, lender = row
        dob_str = str(dob) if dob else ''
        dedupe_key = (fn, ln, em, dob_str)
        existing_leads[dedupe_key] = {'id': lead_id, 'lender': lender or ''}
    print(f"    Found {len(existing_leads)} existing leads", flush=True)

    # Process rows - collect all data first
    print("\n[5] Processing rows...", flush=True)

    # Track new leads to insert (dedupe_key -> lead data)
    new_leads = {}
    # Track existing leads to update (lead_id -> new merged lender)
    leads_to_update = {}

    matched = 0
    not_found = 0
    merged_new = 0  # Merged within new batch
    merged_existing = 0  # Merged with existing DB leads
    logs = []

    for idx, row in df.iterrows():
        reference = clean_reference(row.get('Reference'))
        lender = clean_text(row.get('Lender'))

        if not reference:
            logs.append(f"[SKIP] Row {idx}: No reference")
            continue

        if reference not in ref_to_contact:
            logs.append(f"[NOT_FOUND] Row {idx}: Reference {reference}")
            not_found += 1
            continue

        contact = ref_to_contact[reference]

        # Build dedupe key
        fn = (contact['first_name'] or '').lower()
        ln = (contact['last_name'] or '').lower()
        em = (contact['email'] or '').lower()
        dob_str = str(contact['dob']) if contact['dob'] else ''
        dedupe_key = (fn, ln, em, dob_str)

        # Check if already exists in DB
        if dedupe_key in existing_leads:
            existing = existing_leads[dedupe_key]
            lead_id = existing['id']

            # Merge lender
            new_lender = merge_lenders(existing['lender'], lender)

            if new_lender != existing['lender']:
                leads_to_update[lead_id] = new_lender
                existing_leads[dedupe_key]['lender'] = new_lender  # Update cache
                logs.append(f"[MERGE_EXISTING] Row {idx}: {contact['first_name']} {contact['last_name']} + {lender}")
                merged_existing += 1
            continue

        # Check if already in our new batch
        if dedupe_key in new_leads:
            # Merge lender with existing in batch
            new_leads[dedupe_key]['lender'] = merge_lenders(new_leads[dedupe_key]['lender'], lender)
            logs.append(f"[MERGE_NEW] Row {idx}: {contact['first_name']} {contact['last_name']} + {lender}")
            merged_new += 1
            continue

        # New lead - add to batch
        matched += 1
        new_leads[dedupe_key] = {
            'reference': reference,
            'first_name': contact['first_name'],
            'last_name': contact['last_name'],
            'phone': contact['phone'],
            'email': contact['email'],
            'dob': contact['dob'],
            'lender': lender or '',
            'extra_lender': contact['extra_lenders'],
            'ip_address': contact['ip_address'],
            'address': contact['address'],
            'previous_addresses': contact['previous_addresses'],
            'status': 'awaiting_call'
        }

        logs.append(f"[ADD] Row {idx}: {contact['first_name']} {contact['last_name']} - Lender: {lender}")

    print(f"\n    Processed: {total_rows}", flush=True)
    print(f"    New leads: {matched}", flush=True)
    print(f"    Merged (new batch): {merged_new}", flush=True)
    print(f"    Merged (existing): {merged_existing}", flush=True)
    print(f"    Not Found: {not_found}", flush=True)

    # Insert new leads
    if new_leads:
        print(f"\n[6] Inserting {len(new_leads)} leads...", flush=True)

        from psycopg2.extras import execute_batch

        insert_data = []
        for lead in new_leads.values():
            insert_data.append((
                lead['reference'],
                lead['first_name'],
                lead['last_name'],
                lead['phone'],
                lead['email'],
                lead['dob'],
                lead['lender'],
                lead['extra_lender'],
                lead['ip_address'],
                json.dumps(lead['address']) if lead['address'] else None,
                json.dumps(lead['previous_addresses']) if lead['previous_addresses'] else '[]',
                lead['status']
            ))

        execute_batch(cur, """
            INSERT INTO leads (reference, first_name, last_name, phone, email, dob, lender,
                               extra_lender, ip_address, address, previous_addresses, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, insert_data, page_size=1000)

        conn.commit()
        print(f"    Inserted {len(new_leads)} leads!", flush=True)

    # Update existing leads with merged lenders
    if leads_to_update:
        print(f"\n[7] Updating {len(leads_to_update)} existing leads with merged lenders...", flush=True)

        from psycopg2.extras import execute_batch

        update_data = [(lender, lead_id) for lead_id, lender in leads_to_update.items()]

        execute_batch(cur, """
            UPDATE leads SET lender = %s, updated_at = NOW() WHERE id = %s
        """, update_data, page_size=1000)

        conn.commit()
        print(f"    Updated {len(leads_to_update)} leads!", flush=True)

    # Write log
    print(f"\n[8] Writing log...", flush=True)
    with open(LOG_FILE, 'w') as f:
        f.write(f"Copy Contacts to Leads Log - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 80 + "\n")
        f.write(f"Total rows: {total_rows}\n")
        f.write(f"New leads inserted: {len(new_leads)}\n")
        f.write(f"Merged within batch: {merged_new}\n")
        f.write(f"Merged with existing: {merged_existing}\n")
        f.write(f"Reference not found: {not_found}\n")
        f.write("=" * 80 + "\n\n")
        for log in logs:
            f.write(log + "\n")
    print(f"    Log: {LOG_FILE}", flush=True)

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == '__main__':
    main()
