#!/bin/bash
# Copy RDS database to local PostgreSQL
# Local password: admin123

# RDS (source)
RDS_HOST="rowan-rose-solicitors-clients-list.cjme82cqwljz.eu-north-1.rds.amazonaws.com"
RDS_PORT="5432"
RDS_DB="client_credentials"
RDS_USER="postgres"
RDS_PASSWORD="admin123"

# Local (target)
LOCAL_HOST="localhost"
LOCAL_PORT="5432"
LOCAL_DB="client_credentials"
LOCAL_USER="postgres"
LOCAL_PASSWORD="admin123"

DUMP_FILE="rds_backup.dump"

echo "============================================"
echo "  Copy RDS Database to Local PostgreSQL"
echo "============================================"
echo ""

# Step 1: Dump from RDS
echo "[1/3] Dumping from RDS (this may take a while)..."
PGPASSWORD="$RDS_PASSWORD" pg_dump \
  -h "$RDS_HOST" \
  -p "$RDS_PORT" \
  -U "$RDS_USER" \
  -d "$RDS_DB" \
  -F c \
  -f "$DUMP_FILE"

if [ $? -ne 0 ]; then
  echo "ERROR: pg_dump failed. Make sure your IP is allowed in the RDS security group."
  exit 1
fi
echo "    Dump complete: $DUMP_FILE"

# Step 2: Create local database (drop if exists)
echo ""
echo "[2/3] Creating local database '$LOCAL_DB'..."
PGPASSWORD="$LOCAL_PASSWORD" dropdb -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" --if-exists "$LOCAL_DB" 2>/dev/null
PGPASSWORD="$LOCAL_PASSWORD" createdb -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" "$LOCAL_DB"

if [ $? -ne 0 ]; then
  echo "ERROR: Could not create local database. Make sure PostgreSQL is running locally."
  exit 1
fi
echo "    Database created."

# Step 3: Restore to local
echo ""
echo "[3/3] Restoring to local database..."
PGPASSWORD="$LOCAL_PASSWORD" pg_restore \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  --no-owner \
  --no-privileges \
  "$DUMP_FILE"

if [ $? -ne 0 ]; then
  echo "WARNING: pg_restore completed with some warnings (this is usually fine)."
fi

# Cleanup
rm -f "$DUMP_FILE"

echo ""
echo "============================================"
echo "  DONE! Local database ready."
echo "============================================"
echo ""
echo "Connection details:"
echo "  Host:     localhost"
echo "  Port:     5432"
echo "  Database: $LOCAL_DB"
echo "  User:     $LOCAL_USER"
echo "  Password: $LOCAL_PASSWORD"
