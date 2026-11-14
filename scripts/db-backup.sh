#!/bin/bash
set -e
set -a
source ./prod.env
set +a

# Configuration (adjust variable names to match your prod.env)
CONTAINER_NAME=$(docker ps --filter "name=jrcutz-db" --format "{{.Names}}" | head -n 1)
DB_NAME="$POSTGRES_DB"
DB_USER="$POSTGRES_USER"
BACKUP_DIR="/home/ubuntu/jrcutz_db_backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_backup_${DB_NAME}_$TIMESTAMP.sql.gz"
OCI_ACCESS_KEY_ID="$OCI_ACCESS_KEY_ID"
OCI_SECRET_ACCESS_KEY="$OCI_SECRET_ACCESS_KEY"
OCI_BUCKET_NAME="$OCI_BUCKET_NAME"
OCI_BUCKET_NAMESPACE="$OCI_BUCKET_NAMESPACE"
OCI_REGION="$OCI_REGION"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting backup for database: $DB_NAME..."

# Run pg_dump inside the container using credentials from prod.env
docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip \
  > "$BACKUP_FILE"

echo "Local DB backup completed successfully: $BACKUP_FILE"

# Cleanup old backups older than 14 days
echo "Cleaning up old backups older than 14 days..."
find "$BACKUP_DIR" -type f -name "db_backup_*.sql.gz" -mtime +14 -delete

# Configure rclone for Oracle Cloud Infrastructure (OCI) S3 storage
if rclone version &> /dev/null; then
  echo "rclone is installed, creating rclone configuration directory if it doesn't exist..."
  sudo mkdir -p "$HOME/.config/rclone"
else
  echo "rclone not found, installing rclone now..."
  curl https://rclone.org/install.sh | sudo bash
  if command -v rclone &> /dev/null; then
    echo "rclone installed successfully, creating rcloneconfiguration directory..."
    sudo mkdir -p "$HOME/.config/rclone"
  else
    echo "rclone installation failed, exiting."
    exit 1
  fi
fi

if [ ! -f "$HOME/.config/rclone/rclone.conf" ]; then
echo "Creating rclone configuration file..."
cat <<EOF | sudo tee "$HOME/.config/rclone/rclone.conf" > /dev/null
[oracle_s3]
type = s3
provider = Other
access_key_id = $OCI_ACCESS_KEY_ID
secret_access_key = $OCI_SECRET_ACCESS_KEY
region = $OCI_REGION
endpoint = https://$OCI_BUCKET_NAMESPACE.compat.objectstorage.$OCI_REGION.oraclecloud.com
EOF
else
  echo "Rclone configuration file already exists."
fi

# Sync backup to remote storage using rclone
echo "Syncing local backup to remote OCI storage using rclone..."
rclone sync "$BACKUP_DIR" oracle_s3:jrcutz-db-backups

if [ $? -eq 0 ]; then
  echo "Disaster recovery backup to remote OCI storage completed successfully at $TIMESTAMP."
else
  echo "Disaster recovery backup to remote OCI storage failed at $TIMESTAMP."
  exit 1
fi
