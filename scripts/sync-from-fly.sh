#!/bin/bash
# Sync data from Fly.io volume to local data/ directory

set -e

# Get app name from fly.toml
APP_NAME=$(grep '^app = ' fly.toml | sed 's/app = "\(.*\)"/\1/')

if [ -z "$APP_NAME" ]; then
  echo "Error: Could not find app name in fly.toml"
  exit 1
fi

echo "Syncing data from Fly.io app: $APP_NAME"

# Ensure local directories exist
mkdir -p data/overrides

# Sync overrides
echo "Pulling overrides..."
fly sftp get -a "$APP_NAME" /data/overrides/ data/overrides/ --recursive

# Sync database
echo "Pulling database..."
fly sftp get -a "$APP_NAME" /data/adresboek.sqlite data/adresboek.sqlite

echo "Done! You can now commit the changes in data/overrides/ to GitHub."
