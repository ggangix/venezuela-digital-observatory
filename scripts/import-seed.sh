#!/bin/bash
# Import JSON seed files into MongoDB
# Usage: ./scripts/import-seed.sh <MONGO_URI>
# Example: ./scripts/import-seed.sh "mongodb://localhost:27017/ve_monitor"

set -e

MONGO_URI="${1:-$MONGO_URI}"

if [ -z "$MONGO_URI" ]; then
  echo "Error: MONGO_URI is required"
  echo "Usage: ./scripts/import-seed.sh <MONGO_URI>"
  echo "   or: MONGO_URI=... ./scripts/import-seed.sh"
  exit 1
fi

SEED_DIR="$(dirname "$0")/../seed"

if [ ! -d "$SEED_DIR" ]; then
  echo "Error: Seed directory not found at $SEED_DIR"
  exit 1
fi

echo "Importing collections from $SEED_DIR..."

# Import each collection
for file in "$SEED_DIR"/*.json; do
  if [ -f "$file" ]; then
    collection=$(basename "$file" .json)
    echo "  Importing $collection..."
    mongoimport --uri="$MONGO_URI" \
      --collection="$collection" \
      --file="$file" \
      --jsonArray \
      --drop
  fi
done

echo ""
echo "Import complete!"
