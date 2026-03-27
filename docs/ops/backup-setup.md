# Nido SQLite Backup Setup

Daily automatic backup of `nido.db` to S3, with 7-day retention.

## Prerequisites

On the EC2 server:

```bash
# sqlite3 (for safe .backup command)
sudo apt-get install -y sqlite3

# aws-cli (if not already installed)
sudo apt-get install -y awscli
```

## 1. Create S3 Bucket

```bash
aws s3 mb s3://nido-backups --region eu-west-1
```

## 2. IAM Policy

Create an IAM policy with minimal permissions and attach to the EC2 instance role (or create a dedicated IAM user):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::nido-backups",
        "arn:aws:s3:::nido-backups/*"
      ]
    }
  ]
}
```

If using an instance role (recommended), no credentials file is needed. If using IAM user, run `aws configure` on the server.

## 3. Install systemd timer

```bash
# Make script executable
sudo chmod +x /var/www/nido/scripts/backup.sh

# Copy systemd units
sudo cp /var/www/nido/scripts/nido-backup.service /etc/systemd/system/
sudo cp /var/www/nido/scripts/nido-backup.timer /etc/systemd/system/

# Edit the service file to set your bucket name:
sudo systemctl edit nido-backup.service --force
# Add: [Service]
#      Environment=NIDO_S3_BUCKET=your-actual-bucket-name

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable nido-backup.timer
sudo systemctl start nido-backup.timer
```

## 4. Verify

```bash
# Check timer is active
systemctl list-timers | grep nido

# Run manually to test
sudo systemctl start nido-backup.service

# Check logs
journalctl -u nido-backup.service -n 20
```

## 5. Restore from backup

```bash
# List available backups
aws s3 ls s3://nido-backups/nido/backups/

# Download a specific backup
aws s3 cp s3://nido-backups/nido/backups/nido-2026-03-27.db /tmp/nido-restore.db

# Stop the app, replace DB, restart
sudo systemctl stop nido
cp /tmp/nido-restore.db /var/www/nido/nido.db
sudo systemctl start nido
```
