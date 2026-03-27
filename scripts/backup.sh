#!/usr/bin/env bash
set -euo pipefail

# Nido SQLite backup to S3
# Usage: ./scripts/backup.sh
# Env vars: NIDO_DB_PATH, NIDO_S3_BUCKET (required)

DB_PATH="${NIDO_DB_PATH:-/var/www/nido/nido.db}"
S3_BUCKET="${NIDO_S3_BUCKET:?NIDO_S3_BUCKET env var is required}"
S3_PREFIX="nido/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date -u +"%Y-%m-%d")
TMP_BACKUP="/tmp/nido-backup-${TIMESTAMP}.db"

echo "[backup] Starting backup at $(date -u)"

# 1. Safe copy using sqlite3 .backup (handles WAL/journal correctly)
if [ ! -f "$DB_PATH" ]; then
  echo "[backup] ERROR: Database not found at $DB_PATH"
  exit 1
fi

sqlite3 "$DB_PATH" ".backup '$TMP_BACKUP'"
echo "[backup] Created safe copy: $TMP_BACKUP ($(du -h "$TMP_BACKUP" | cut -f1))"

# 2. Upload to S3
aws s3 cp "$TMP_BACKUP" "s3://${S3_BUCKET}/${S3_PREFIX}/nido-${TIMESTAMP}.db" --quiet
echo "[backup] Uploaded to s3://${S3_BUCKET}/${S3_PREFIX}/nido-${TIMESTAMP}.db"

# 3. Clean up local temp file
rm -f "$TMP_BACKUP"

# 4. Delete backups older than retention period
CUTOFF_DATE=$(date -u -d "-${RETENTION_DAYS} days" +"%Y-%m-%d" 2>/dev/null || date -u -v-${RETENTION_DAYS}d +"%Y-%m-%d")
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" | while read -r line; do
  FILE_DATE=$(echo "$line" | awk '{print $1}')
  FILE_NAME=$(echo "$line" | awk '{print $4}')
  if [ -n "$FILE_NAME" ] && [ "$FILE_DATE" \< "$CUTOFF_DATE" ]; then
    aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${FILE_NAME}" --quiet
    echo "[backup] Deleted old backup: $FILE_NAME"
  fi
done

echo "[backup] Done at $(date -u)"
