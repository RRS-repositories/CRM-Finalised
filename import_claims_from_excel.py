#!/usr/bin/env python3
"""
Import claims from Excel file with all columns.

Maps:
- Lead ID → reference_specified in cases (UNIQUE - update if exists)
- Introducer → lender in cases
- Status → status in cases
- EXTRA LENDERS → extra_lenders in contacts
- CREDIT LIMIT & INCREASES → credit_limit_increases in cases
- Complaint Paragraph → complaint_paragraph in cases
- Previous Address 1 → individual columns in contacts
- Previous Address 1-12 → previous_addresses JSONB in contacts (no duplicates)
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

# File paths
EXCEL_FILE = './public/client_with_addresses (1).xlsx'
FAILED_LOG = os.path.expanduser('~/Desktop/import_claims_failed.log')
SUCCESS_LOG = os.path.expanduser('~/Desktop/import_claims_success.log')

# TEST MODE: Set to None for all rows, or a number to limit
TEST_LIMIT = None  # Full import


def clean_text(val):
    """Clean text value, return None if NaN/empty"""
    if pd.isna(val) or str(val).strip() == '' or str(val).strip().lower() == 'nan':
        return None
    return str(val).strip()


def extract_previous_addresses(row):
    """Extract all previous addresses (1-12) from a row"""
    addresses = []
    for i in range(1, 13):
        first_line = clean_text(row.get(f'Previous Address {i} - First Line'))
        town = clean_text(row.get(f'Previous Address {i} - Town'))
        county = clean_text(row.get(f'Previous Address {i} - County'))
        postcode = clean_text(row.get(f'Previous Address {i} - Postcode'))

        # Only add if at least one field has data
        if any([first_line, town, county, postcode]):
            addresses.append({
                'address_line_1': first_line or '',
                'city': town or '',
                'county': county or '',
                'postal_code': postcode or ''
            })
    return addresses


def main():
    print("=" * 60)
    print("IMPORT CLAIMS FROM EXCEL (UPSERT)")
    print("=" * 60)

    # Read Excel file
    print("\n[1] Reading Excel file...", flush=True)
    df = pd.read_excel(EXCEL_FILE)

    if TEST_LIMIT:
        df = df.head(TEST_LIMIT)
        print(f"    ⚠️  TEST MODE: Limited to first {TEST_LIMIT} rows", flush=True)

    total_rows = len(df)
    print(f"    Total rows to process: {total_rows}", flush=True)

    # Connect to database
    print("\n[2] Connecting to database...", flush=True)
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    print("    Connected!", flush=True)

    # Get all contacts with their references
    print("\n[3] Loading contacts from database...", flush=True)
    cur.execute("SELECT id, email, reference, previous_addresses FROM contacts WHERE email IS NOT NULL")
    contacts_data = cur.fetchall()

    # Build email -> contact lookup
    email_to_contact = {}
    for contact_id, email, reference, prev_addresses in contacts_data:
        if email:
            email_lower = email.strip().lower()
            email_to_contact[email_lower] = {
                'id': contact_id,
                'reference': reference or '',
                'previous_addresses': prev_addresses or []
            }

    print(f"    Loaded {len(email_to_contact)} contacts", flush=True)

    # Get existing reference_specified values
    cur.execute("SELECT reference_specified, id FROM cases WHERE reference_specified IS NOT NULL")
    existing_refs = {row[0]: row[1] for row in cur.fetchall()}
    print(f"    Loaded {len(existing_refs)} existing reference_specified values", flush=True)

    # Process rows
    print("\n[4] Processing rows...", flush=True)

    cases_to_insert = []
    cases_to_update = []
    contacts_to_update = []
    failed_logs = []

    matched = 0
    not_matched = 0
    email_not_found = 0
    will_update = 0
    will_insert = 0

    for idx, row in df.iterrows():
        lead_id = clean_text(row.get('Lead ID'))
        email = clean_text(row.get('Email address'))
        lender = clean_text(row.get('Introducer'))

        if not lead_id or not email or not lender:
            failed_logs.append(f"[MISSING_DATA] Row {idx}: Lead ID={lead_id}, Email={email}, Lender={lender}")
            continue

        email = email.lower()
        lender = lender.upper()

        # Find contact by email
        if email not in email_to_contact:
            failed_logs.append(f"[EMAIL_NOT_FOUND] Lead ID: {lead_id}, Email: {email}, Lender: {lender}")
            email_not_found += 1
            continue

        contact = email_to_contact[email]
        contact_id = contact['id']
        references = contact['reference'].split(',') if contact['reference'] else []

        # Check if lead_id exists in contact's references
        if lead_id not in references:
            failed_logs.append(f"[REFERENCE_NOT_MATCH] Lead ID: {lead_id}, Email: {email}, Lender: {lender}, Contact ID: {contact_id}, Existing Refs: {contact['reference']}")
            not_matched += 1
            continue

        # Match found!
        matched += 1

        # Extract case data
        status = clean_text(row.get('Status')) or 'New Lead'
        credit_limit = clean_text(row.get('CREDIT LIMIT & INCREASES'))
        complaint_paragraph = clean_text(row.get('Complaint Paragraph'))

        # Check if reference already exists in cases
        if lead_id in existing_refs:
            # UPDATE existing case
            cases_to_update.append({
                'case_id': existing_refs[lead_id],
                'contact_id': contact_id,
                'lender': lender,
                'reference_specified': lead_id,
                'status': status,
                'credit_limit_increases': credit_limit,
                'complaint_paragraph': complaint_paragraph
            })
            will_update += 1
        else:
            # INSERT new case
            cases_to_insert.append({
                'contact_id': contact_id,
                'lender': lender,
                'reference_specified': lead_id,
                'status': status,
                'credit_limit_increases': credit_limit,
                'complaint_paragraph': complaint_paragraph
            })
            will_insert += 1

        # Extract contact update data
        extra_lenders = clean_text(row.get('EXTRA LENDERS'))
        new_addresses = extract_previous_addresses(row)

        # Get first address for individual columns
        first_addr = new_addresses[0] if new_addresses else None

        # Merge with existing addresses (no duplicates)
        existing_addresses = contact['previous_addresses'] if isinstance(contact['previous_addresses'], list) else []
        existing_keys = set()
        for addr in existing_addresses:
            key = (addr.get('address_line_1', ''), addr.get('city', ''), addr.get('postal_code', ''))
            existing_keys.add(key)

        merged_addresses = existing_addresses.copy()
        for addr in new_addresses:
            key = (addr.get('address_line_1', ''), addr.get('city', ''), addr.get('postal_code', ''))
            if key not in existing_keys:
                merged_addresses.append(addr)
                existing_keys.add(key)

        contacts_to_update.append({
            'contact_id': contact_id,
            'extra_lenders': extra_lenders,
            'previous_addresses': merged_addresses,
            'first_addr': first_addr
        })

        # Print progress every 100
        processed = idx + 1
        if processed % 100 == 0:
            print(f"    Processed {processed}/{total_rows} rows... (Matched: {matched}, Update: {will_update}, Insert: {will_insert})", flush=True)

    print(f"\n    Final: Processed {total_rows} rows", flush=True)
    print(f"    Matched: {matched}", flush=True)
    print(f"    Will Update: {will_update}", flush=True)
    print(f"    Will Insert: {will_insert}", flush=True)
    print(f"    Reference Not Match: {not_matched}", flush=True)
    print(f"    Email Not Found: {email_not_found}", flush=True)

    # Update existing cases
    success_logs = []

    if cases_to_update:
        print(f"\n[5] Updating {len(cases_to_update)} existing cases...", flush=True)

        updated = 0
        for i, c in enumerate(cases_to_update):
            try:
                cur.execute("""
                    UPDATE cases
                    SET status = %s,
                        credit_limit_increases = %s,
                        complaint_paragraph = %s
                    WHERE id = %s
                """, [c['status'], c['credit_limit_increases'], c['complaint_paragraph'], c['case_id']])
                updated += 1
                success_logs.append(f"[UPDATED] Case ID: {c['case_id']}, Contact ID: {c['contact_id']}, Lender: {c['lender']}, Reference: {c['reference_specified']}")

                if (i + 1) % 100 == 0:
                    conn.commit()
                    print(f"    Updated {i + 1}/{len(cases_to_update)} cases", flush=True)
            except Exception as e:
                failed_logs.append(f"[UPDATE_FAILED] Case ID: {c['case_id']}, Reference: {c['reference_specified']}, Error: {str(e)}")

        conn.commit()
        print(f"    Total updated: {updated} cases", flush=True)

    # Insert new cases
    if cases_to_insert:
        print(f"\n[6] Inserting {len(cases_to_insert)} new cases in batches of 100...", flush=True)

        inserted = 0
        batch_size = 100

        for i in range(0, len(cases_to_insert), batch_size):
            batch = cases_to_insert[i:i + batch_size]

            try:
                values_template = ','.join(['(%s, %s, %s, %s, %s, %s, %s, false)' for _ in batch])
                values = []
                for c in batch:
                    values.extend([
                        c['contact_id'],
                        c['lender'],
                        c['reference_specified'],
                        c['status'],
                        0,  # claim_value
                        c['credit_limit_increases'],
                        c['complaint_paragraph']
                    ])

                cur.execute(f"""
                    INSERT INTO cases (contact_id, lender, reference_specified, status, claim_value, credit_limit_increases, complaint_paragraph, loa_generated)
                    VALUES {values_template}
                    RETURNING id, contact_id, lender, reference_specified
                """, values)

                inserted_rows = cur.fetchall()
                conn.commit()

                for row in inserted_rows:
                    success_logs.append(f"[INSERTED] Case ID: {row[0]}, Contact ID: {row[1]}, Lender: {row[2]}, Reference: {row[3]}")

                inserted += len(batch)
                print(f"    Inserted batch {i//batch_size + 1}: {inserted}/{len(cases_to_insert)} cases", flush=True)
            except Exception as e:
                conn.rollback()
                for c in batch:
                    failed_logs.append(f"[INSERT_FAILED] Contact ID: {c['contact_id']}, Lender: {c['lender']}, Reference: {c['reference_specified']}, Error: {str(e)}")
                print(f"    Batch {i//batch_size + 1} FAILED: {str(e)}", flush=True)

        print(f"\n    Total inserted: {inserted} cases", flush=True)

    # Update contacts
    if contacts_to_update:
        print(f"\n[7] Updating {len(contacts_to_update)} contacts...", flush=True)

        updated = 0
        for i, c in enumerate(contacts_to_update):
            try:
                # Update with first address in individual columns + JSONB + extra_lenders
                if c['first_addr']:
                    cur.execute("""
                        UPDATE contacts
                        SET extra_lenders = COALESCE(%s, extra_lenders),
                            previous_addresses = %s,
                            previous_address_line_1 = COALESCE(%s, previous_address_line_1),
                            previous_city = COALESCE(%s, previous_city),
                            previous_county = COALESCE(%s, previous_county),
                            previous_postal_code = COALESCE(%s, previous_postal_code)
                        WHERE id = %s
                    """, [
                        c['extra_lenders'],
                        json.dumps(c['previous_addresses']),
                        c['first_addr']['address_line_1'],
                        c['first_addr']['city'],
                        c['first_addr']['county'],
                        c['first_addr']['postal_code'],
                        c['contact_id']
                    ])
                else:
                    cur.execute("""
                        UPDATE contacts
                        SET extra_lenders = COALESCE(%s, extra_lenders),
                            previous_addresses = %s
                        WHERE id = %s
                    """, [c['extra_lenders'], json.dumps(c['previous_addresses']), c['contact_id']])

                updated += 1

                if (i + 1) % 100 == 0:
                    conn.commit()
                    print(f"    Updated {i + 1}/{len(contacts_to_update)} contacts", flush=True)
            except Exception as e:
                failed_logs.append(f"[CONTACT_UPDATE_FAILED] Contact ID: {c['contact_id']}, Error: {str(e)}")

        conn.commit()
        print(f"    Total updated: {updated} contacts", flush=True)

    # Write success logs
    if success_logs:
        print(f"\n[8] Writing {len(success_logs)} success entries to log...", flush=True)
        with open(SUCCESS_LOG, 'w') as f:
            f.write(f"Import Claims Success Log - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 80 + "\n\n")
            for log in success_logs:
                f.write(log + "\n")
        print(f"    Success log saved to: {SUCCESS_LOG}", flush=True)

    # Write failed logs
    if failed_logs:
        print(f"\n[9] Writing {len(failed_logs)} failed entries to log...", flush=True)
        with open(FAILED_LOG, 'w') as f:
            f.write(f"Import Claims Failed Log - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 80 + "\n\n")
            for log in failed_logs:
                f.write(log + "\n")
        print(f"    Failed log saved to: {FAILED_LOG}", flush=True)

    # Close connection
    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == '__main__':
    main()
