#!/usr/bin/env python3
"""
Add extra_lender and ip_address columns to leads table
Drop notes column from leads table
"""

import psycopg2
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

print("Connecting to database...")
conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()
print("Connected!")

# Add columns to leads table
print("\nModifying LEADS table...")
cur.execute("ALTER TABLE leads ADD COLUMN IF NOT EXISTS extra_lender TEXT;")
print("  - extra_lender added")
cur.execute("ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);")
print("  - ip_address added")
cur.execute("ALTER TABLE leads DROP COLUMN IF EXISTS notes;")
print("  - notes dropped")

conn.commit()
print("\nDONE! Columns modified successfully.")

cur.close()
conn.close()
