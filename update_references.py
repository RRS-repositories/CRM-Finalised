#!/usr/bin/env python3
"""
Update contact references from CSV file
Matches emails from CSV with contacts in database and updates reference column
"""

import psycopg2
import csv
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

print("=" * 60)
print("CONTACT REFERENCE UPDATE SCRIPT")
print("=" * 60)
print(f"\nConnecting to database: {DB_NAME}@{DB_HOST}")

# Connect to database
try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        sslmode='require'
    )
    cursor = conn.cursor()
    print("✅ Successfully connected to the database!")
except Exception as e:
    print(f"❌ Error connecting to database: {e}")
    exit(1)

# # Drop and recreate reference column (fastest way to clear all data)
# print("\nDropping and recreating reference column...")
# try:
#     cursor.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS reference")
#     cursor.execute("ALTER TABLE contacts ADD COLUMN reference VARCHAR(255)")
#     conn.commit()
#     print("Done - reference column reset.")
# except Exception as e:
#     conn.rollback()
#     print(f"Error resetting column: {e}")
#     cursor.close()
#     conn.close()
#     exit(1)

# Read CSV file
csv_path = './public/loa uploaded  - Sheet6.csv'
print(f"\nReading CSV file: {csv_path}")

try:
    with open(csv_path, 'r', encoding='utf-8') as file:
        csv_reader = csv.reader(file)
        csv_data = [(row[0].strip(), row[1].strip().lower()) for row in csv_reader if len(row) >= 2]
    
    print(f"✅ CSV loaded successfully! Total records: {len(csv_data)}")
except Exception as e:
    print(f"❌ Error loading CSV: {e}")
    cursor.close()
    conn.close()
    exit(1)

# Check total contacts in database
cursor.execute("SELECT COUNT(*) FROM contacts")
total_contacts = cursor.fetchone()[0]
print(f"\nTotal contacts in database: {total_contacts}")

# Group all references by email (one email can have multiple references)
print("\nGrouping references by email...")
from collections import defaultdict
refs_by_email = defaultdict(list)
for reference, email in csv_data:
    if reference not in refs_by_email[email]:
        refs_by_email[email].append(reference)

multi_ref_count = sum(1 for refs in refs_by_email.values() if len(refs) > 1)
print(f"Unique emails: {len(refs_by_email)}, Emails with multiple references: {multi_ref_count}")

# Batch update all references in a single query
print("\nBuilding batch update...", flush=True)

values = [(','.join(refs), email) for email, refs in refs_by_email.items()]
print(f"Sending {len(values)} updates in one query...", flush=True)

from psycopg2.extras import execute_values
cursor.execute("""
    CREATE TEMP TABLE ref_updates (ref VARCHAR(255), email VARCHAR(255))
""")
execute_values(cursor, "INSERT INTO ref_updates (ref, email) VALUES %s", values)

cursor.execute("""
    UPDATE contacts c
    SET reference = r.ref
    FROM ref_updates r
    WHERE LOWER(c.email) = r.email
""")
updated_count = cursor.rowcount
conn.commit()

# Find not-found emails
cursor.execute("""
    SELECT r.email FROM ref_updates r
    LEFT JOIN contacts c ON LOWER(c.email) = r.email
    WHERE c.id IS NULL
""")
not_found_emails = [row[0] for row in cursor.fetchall()]
not_found_count = len(not_found_emails)

cursor.execute("DROP TABLE IF EXISTS ref_updates")
conn.commit()

print("\n" + "=" * 60)
print("UPDATE COMPLETE!")
print("=" * 60)
print(f"Updated: {updated_count} contacts")
print(f"Not found in database: {not_found_count} emails")

# Verify
cursor.execute("SELECT COUNT(*) FROM contacts WHERE reference IS NOT NULL")
contacts_with_ref = cursor.fetchone()[0]
print(f"\nTotal contacts with reference: {contacts_with_ref}")

# Sample
print("\nSample updated contacts:")
cursor.execute("SELECT id, email, reference FROM contacts WHERE reference IS NOT NULL LIMIT 10")
for contact in cursor.fetchall():
    print(f"  ID: {contact[0]}, Email: {contact[1]}, Reference: {contact[2]}")

if not_found_count > 0:
    print(f"\nEmails not found in database (first 10):")
    for email in not_found_emails[:10]:
        print(f"  - {email}")

# Close connection
cursor.close()
conn.close()
print("\n✅ Database connection closed successfully!")
print("=" * 60)
