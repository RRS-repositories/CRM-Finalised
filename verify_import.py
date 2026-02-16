#!/usr/bin/env python3
import pandas as pd
import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

# Read Excel
df = pd.read_excel('./public/client_with_addresses (1).xlsx')
df = df.head(10)

# Connect to DB
conn = psycopg2.connect(
    host=os.getenv('DB_HOST'),
    database=os.getenv('DB_NAME'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASSWORD'),
    port=os.getenv('DB_PORT', 5432)
)
cur = conn.cursor()

print('=' * 80)
print('COMPARING EXCEL vs DATABASE')
print('=' * 80)

for idx, row in df.iterrows():
    lead_id = str(row['Lead ID'])

    cur.execute('''
        SELECT c.id, c.lender, c.status, c.reference_specified,
               c.credit_limit_increases, c.complaint_paragraph,
               cnt.extra_lenders, cnt.previous_addresses
        FROM cases c
        JOIN contacts cnt ON c.contact_id = cnt.id
        WHERE c.reference_specified = %s
        ORDER BY c.id DESC LIMIT 1
    ''', [lead_id])

    db_row = cur.fetchone()

    print(f'\n--- Row {idx} | Lead ID: {lead_id} ---')

    if not db_row:
        print('  NOT FOUND IN DB!')
        continue

    # Lender
    excel_lender = str(row['Introducer']).upper()
    db_lender = db_row[1]
    match = '✅' if excel_lender == db_lender else '❌'
    print(f'  Lender: {match} Excel: {excel_lender} | DB: {db_lender}')

    # Status
    excel_status = str(row['Status'])
    db_status = db_row[2]
    match = '✅' if excel_status == db_status else '❌'
    print(f'  Status: {match} Excel: {excel_status} | DB: {db_status}')

    # Credit Limit
    excel_cl = str(row['CREDIT LIMIT & INCREASES'])[:50] if pd.notna(row['CREDIT LIMIT & INCREASES']) else 'None'
    db_cl = str(db_row[4])[:50] if db_row[4] else 'None'
    match = '✅' if excel_cl == db_cl else '❌'
    print(f'  Credit Limit: {match}')
    print(f'    Excel: {excel_cl}')
    print(f'    DB:    {db_cl}')

    # Complaint
    excel_cp = str(row['Complaint Paragraph'])[:50] if pd.notna(row['Complaint Paragraph']) else 'None'
    db_cp = str(db_row[5])[:50] if db_row[5] else 'None'
    match = '✅' if excel_cp == db_cp else '❌'
    print(f'  Complaint: {match}')
    print(f'    Excel: {excel_cp}')
    print(f'    DB:    {db_cp}')

    # Extra Lenders
    excel_el = str(row['EXTRA LENDERS'])[:50] if pd.notna(row['EXTRA LENDERS']) else 'None'
    db_el = str(db_row[6])[:50] if db_row[6] else 'None'
    match = '✅' if excel_el == db_el else '❌'
    print(f'  Extra Lenders: {match}')
    print(f'    Excel: {excel_el}')
    print(f'    DB:    {db_el}')

    # Prev Address
    prev_addr_excel = row.get('Previous Address 1 - First Line')
    prev_addr_db = db_row[7]
    if pd.notna(prev_addr_excel):
        db_addr = prev_addr_db[0].get('address_line_1', '') if prev_addr_db and len(prev_addr_db) > 0 else 'None'
        match = '✅' if str(prev_addr_excel) == db_addr else '❌'
        print(f'  Prev Addr 1: {match}')
        print(f'    Excel: {prev_addr_excel}')
        print(f'    DB:    {db_addr}')
    else:
        print(f'  Prev Addr 1: ✅ (None in Excel)')

conn.close()
print('\n' + '=' * 80)
