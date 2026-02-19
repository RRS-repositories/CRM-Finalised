#!/usr/bin/env python3
"""
Document Migration Script
Migrates files from migration-bucket-flg to client.landing.page
with proper classification and organization

Usage:
    python migrate_documents.py --dry-run    # Preview what would be copied
    python migrate_documents.py              # Run actual migration
    python migrate_documents.py --limit 10   # Process only 10 references
"""

import os
import re
import json
import argparse
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import boto3
import psycopg2
import pandas as pd
from dotenv import load_dotenv

from document_classifier import DocumentClassifier

# Load environment variables (use existing .env)
load_dotenv('.env')

# Configuration
SOURCE_BUCKET = 'migration-bucket-flg'
SOURCE_PREFIX = 'export/12509/'
TARGET_BUCKET = 'client.landing.page'
EXCEL_FILE = './LOA SIGNED LEAD.xlsx'
LENDERS_FILE = './all_lenders_details.json'

# AWS Clients
s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name=os.getenv('AWS_REGION', 'eu-north-1')
)

# Database connection
def get_db_connection():
    return psycopg2.connect(
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT', 5432),
        database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        sslmode='require'
    )

# Logging
class MigrationLogger:
    def __init__(self, log_dir: str):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self.success = []
        self.errors = []
        self.skipped = []
        self.ai_classified = []

    def log_success(self, source: str, target: str, classification: Dict):
        self.success.append({
            'source': source,
            'target': target,
            'classification': classification,
            'timestamp': datetime.now().isoformat()
        })

    def log_error(self, error_type: str, details: str, source: str = None):
        self.errors.append({
            'type': error_type,
            'details': details,
            'source': source,
            'timestamp': datetime.now().isoformat()
        })

    def log_skip(self, source: str, reason: str):
        self.skipped.append({
            'source': source,
            'reason': reason,
            'timestamp': datetime.now().isoformat()
        })

    def log_ai(self, source: str, classification: Dict):
        self.ai_classified.append({
            'source': source,
            'classification': classification,
            'timestamp': datetime.now().isoformat()
        })

    def save(self):
        with open(f'{self.log_dir}/success.json', 'w') as f:
            json.dump(self.success, f, indent=2)
        with open(f'{self.log_dir}/errors.json', 'w') as f:
            json.dump(self.errors, f, indent=2)
        with open(f'{self.log_dir}/skipped.json', 'w') as f:
            json.dump(self.skipped, f, indent=2)
        with open(f'{self.log_dir}/ai_classified.json', 'w') as f:
            json.dump(self.ai_classified, f, indent=2)

        summary = {
            'total_success': len(self.success),
            'total_errors': len(self.errors),
            'total_skipped': len(self.skipped),
            'total_ai_classified': len(self.ai_classified),
            'completed_at': datetime.now().isoformat()
        }
        with open(f'{self.log_dir}/summary.json', 'w') as f:
            json.dump(summary, f, indent=2)

        print(f"\nMigration Summary:")
        print(f"  Success: {len(self.success)}")
        print(f"  Errors: {len(self.errors)}")
        print(f"  Skipped: {len(self.skipped)}")
        print(f"  AI Classified: {len(self.ai_classified)}")
        print(f"  Logs saved to: {self.log_dir}/")


def load_excel_references(filepath: str) -> List[str]:
    """Load reference numbers from Excel file"""
    df = pd.read_excel(filepath)
    references = df['reference'].astype(str).tolist()
    print(f"Loaded {len(references)} references from Excel")
    return references


def build_reference_map(conn) -> Dict[str, Dict]:
    """
    Build mapping from reference number to contact details

    Returns:
        Dict[reference] = {contact_id, first_name, last_name, cases: [{id, lender}]}
    """
    cur = conn.cursor()

    # Get all contacts with references and their cases
    cur.execute("""
        SELECT
            c.id,
            c.first_name,
            c.last_name,
            c.reference,
            COALESCE(
                json_agg(
                    json_build_object('id', cs.id, 'lender', cs.lender)
                ) FILTER (WHERE cs.id IS NOT NULL),
                '[]'
            ) as cases
        FROM contacts c
        LEFT JOIN cases cs ON cs.contact_id = c.id
        WHERE c.reference IS NOT NULL AND c.reference != ''
        GROUP BY c.id, c.first_name, c.last_name, c.reference
    """)

    ref_map = {}
    for row in cur.fetchall():
        contact_id, first_name, last_name, reference, cases = row
        # Split comma-separated references
        refs = [r.strip() for r in reference.split(',') if r.strip()]

        for ref in refs:
            ref_map[ref] = {
                'contact_id': contact_id,
                'first_name': first_name or 'Unknown',
                'last_name': last_name or 'Unknown',
                'cases': cases if cases else []
            }

    print(f"Built reference map with {len(ref_map)} unique references")
    return ref_map


def list_s3_folder(bucket: str, prefix: str) -> List[str]:
    """List all objects in an S3 folder"""
    objects = []
    paginator = s3_client.get_paginator('list_objects_v2')

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        if 'Contents' in page:
            for obj in page['Contents']:
                if not obj['Key'].endswith('/'):  # Skip folder markers
                    objects.append(obj['Key'])

    return objects


def sanitize_name(name: str) -> str:
    """Sanitize name for S3 path (remove special chars, replace spaces with underscore)"""
    return re.sub(r'[^a-zA-Z0-9\s]', '', name).replace(' ', '_').strip('_')


def build_target_path(
    doc_type: str,
    contact: Dict,
    lender: Optional[str],
    original_filename: str
) -> Tuple[str, str]:
    """
    Build target S3 path based on document type

    Returns:
        Tuple of (full_s3_path, new_filename)
    """
    first_name = sanitize_name(contact['first_name'])
    last_name = sanitize_name(contact['last_name'])
    contact_id = contact['contact_id']
    base_folder = f"{first_name}_{last_name}_{contact_id}"

    # Get refSpec from case if available
    cases = contact.get('cases', [])
    if cases and len(cases) > 0:
        case_id = cases[0]['id']
        ref_spec = f"{contact_id}{case_id}"
    else:
        ref_spec = str(contact_id)

    full_name = f"{contact['first_name']} {contact['last_name']}"

    if doc_type == 'LOA' and lender:
        sanitized_lender = sanitize_name(lender)
        new_filename = f"{ref_spec} - {full_name} - {sanitized_lender} - LOA.pdf"
        target_path = f"{base_folder}/Lenders/{sanitized_lender}/{new_filename}"

    elif doc_type == 'COVER_LETTER' and lender:
        sanitized_lender = sanitize_name(lender)
        new_filename = f"{ref_spec} - {full_name} - {sanitized_lender} - COVER LETTER.pdf"
        target_path = f"{base_folder}/Lenders/{sanitized_lender}/{new_filename}"

    elif doc_type == 'ID_DOCUMENT':
        new_filename = original_filename
        target_path = f"{base_folder}/Documents/ID_Document/{new_filename}"

    else:  # OTHER, COMPLAINT, etc.
        new_filename = original_filename
        target_path = f"{base_folder}/Documents/Other/{new_filename}"

    return target_path, new_filename


def get_lender_from_contact(contact: Dict, classifier_lender: Optional[str]) -> Optional[str]:
    """
    Get lender name, trying contact's cases first, then classifier result

    Args:
        contact: Contact dict with cases
        classifier_lender: Lender extracted by classifier
    """
    cases = contact.get('cases', [])

    # If classifier found a lender, use it
    if classifier_lender:
        return classifier_lender

    # Otherwise, use first case's lender
    if cases and len(cases) > 0 and cases[0].get('lender'):
        return cases[0]['lender']

    return None


def copy_s3_object(source_bucket: str, source_key: str, target_bucket: str, target_key: str, dry_run: bool = False):
    """Copy object from source to target bucket"""
    if dry_run:
        print(f"  [DRY-RUN] Would copy: {source_key} -> {target_key}")
        return True

    try:
        s3_client.copy_object(
            CopySource={'Bucket': source_bucket, 'Key': source_key},
            Bucket=target_bucket,
            Key=target_key
        )
        return True
    except Exception as e:
        print(f"  [ERROR] Copy failed: {e}")
        return False


def process_reference(
    reference: str,
    contact: Dict,
    classifier: DocumentClassifier,
    logger: MigrationLogger,
    dry_run: bool = False
) -> Dict:
    """
    Process all files for a single reference

    Returns:
        Dict with counts: {processed, success, errors}
    """
    folder_prefix = f"{SOURCE_PREFIX}{reference}/"
    files = list_s3_folder(SOURCE_BUCKET, folder_prefix)

    stats = {'processed': 0, 'success': 0, 'errors': 0}

    if not files:
        logger.log_skip(folder_prefix, 'No files found in folder')
        return stats

    for source_key in files:
        stats['processed'] += 1
        filename = os.path.basename(source_key)

        # Skip system files
        if filename.startswith('.') or filename == 'Thumbs.db':
            logger.log_skip(source_key, 'System file')
            continue

        try:
            # Classify document
            classification = classifier.classify(filename)

            if classification['method'] == 'bedrock':
                logger.log_ai(source_key, classification)

            # Get lender
            lender = get_lender_from_contact(contact, classification.get('lender'))

            # Build target path
            target_path, new_filename = build_target_path(
                classification['type'],
                contact,
                lender,
                filename
            )

            # Copy file
            if copy_s3_object(SOURCE_BUCKET, source_key, TARGET_BUCKET, target_path, dry_run):
                logger.log_success(source_key, target_path, classification)
                stats['success'] += 1
            else:
                logger.log_error('COPY_FAILED', f'Failed to copy {source_key}', source_key)
                stats['errors'] += 1

        except Exception as e:
            logger.log_error('PROCESSING_ERROR', str(e), source_key)
            stats['errors'] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(description='Migrate documents from staging to CRM bucket')
    parser.add_argument('--dry-run', action='store_true', help='Preview without copying')
    parser.add_argument('--limit', type=int, help='Limit number of references to process')
    parser.add_argument('--no-bedrock', action='store_true', help='Disable AI classification')
    parser.add_argument('--reference', type=str, help='Process single reference')
    args = parser.parse_args()

    print("=" * 60)
    print("Document Migration Script")
    print("=" * 60)
    print(f"Source: s3://{SOURCE_BUCKET}/{SOURCE_PREFIX}")
    print(f"Target: s3://{TARGET_BUCKET}/")
    print(f"Dry Run: {args.dry_run}")
    print(f"AI Classification: {not args.no_bedrock}")
    print("=" * 60)

    # Initialize
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_dir = f"./migration_logs_{timestamp}"
    logger = MigrationLogger(log_dir)

    classifier = DocumentClassifier(
        lenders_file=LENDERS_FILE,
        use_bedrock=not args.no_bedrock
    )

    # Connect to database
    print("\nConnecting to database...")
    conn = get_db_connection()

    # Build reference map
    print("Building reference map...")
    ref_map = build_reference_map(conn)

    # Load Excel references
    if args.reference:
        excel_refs = [args.reference]
    else:
        print("Loading Excel references...")
        excel_refs = load_excel_references(EXCEL_FILE)

    if args.limit:
        excel_refs = excel_refs[:args.limit]
        print(f"Limited to {args.limit} references")

    # Process each reference
    print(f"\nProcessing {len(excel_refs)} references...")
    total_stats = {'processed': 0, 'success': 0, 'errors': 0, 'not_found': 0}

    for i, reference in enumerate(excel_refs, 1):
        reference = str(reference).strip()

        # Find contact for this reference
        contact = ref_map.get(reference)
        if not contact:
            logger.log_error('REFERENCE_NOT_FOUND', f'No contact found for reference {reference}')
            total_stats['not_found'] += 1
            continue

        print(f"[{i}/{len(excel_refs)}] Processing {reference} -> {contact['first_name']} {contact['last_name']} (ID: {contact['contact_id']})", flush=True)

        stats = process_reference(reference, contact, classifier, logger, args.dry_run)
        total_stats['processed'] += stats['processed']
        total_stats['success'] += stats['success']
        total_stats['errors'] += stats['errors']

        # Progress update every 100 references
        if i % 100 == 0:
            print(f"\n--- Progress: {i}/{len(excel_refs)} references processed ---")
            print(f"    Files: {total_stats['processed']}, Success: {total_stats['success']}, Errors: {total_stats['errors']}")
            print()

    # Save logs
    logger.save()

    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)
    print(f"References processed: {len(excel_refs)}")
    print(f"References not found: {total_stats['not_found']}")
    print(f"Files processed: {total_stats['processed']}")
    print(f"Files copied: {total_stats['success']}")
    print(f"Errors: {total_stats['errors']}")
    print(f"Logs: {log_dir}/")

    conn.close()


if __name__ == '__main__':
    main()
