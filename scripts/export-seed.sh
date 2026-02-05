#!/bin/bash
# Export MongoDB collections to JSON seed files
# Usage: ./scripts/export-seed.sh <MONGO_URI>
# Example: ./scripts/export-seed.sh "mongodb://localhost:27017/ve_monitor"

set -e

MONGO_URI="${1:-$MONGO_URI}"

if [ -z "$MONGO_URI" ]; then
  echo "Error: MONGO_URI is required"
  echo "Usage: ./scripts/export-seed.sh <MONGO_URI>"
  echo "   or: MONGO_URI=... ./scripts/export-seed.sh"
  exit 1
fi

SEED_DIR="$(dirname "$0")/../seed"
mkdir -p "$SEED_DIR"

echo "Exporting collections to $SEED_DIR..."

# Export each collection
collections=("ve_monitor_checks" "ve_monitor_domains" "ve_monitor_whois")

for collection in "${collections[@]}"; do
  echo "  Exporting $collection..."
  mongoexport --uri="$MONGO_URI" \
    --collection="$collection" \
    --out="$SEED_DIR/$collection.json" \
    --jsonArray \
    --pretty
done

echo ""
echo "Export complete! Files created:"
ls -lh "$SEED_DIR"/*.json

echo ""
echo "To import on another machine, run:"
echo "  ./scripts/import-seed.sh <MONGO_URI>"
