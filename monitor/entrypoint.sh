#!/bin/sh

# Wait for VPN to be ready (check if we can reach the internet through VPN)
echo "Waiting for VPN connection..."
sleep 30

# Check VPN IP
echo "Current IP:"
wget -qO- https://ipinfo.io/ip || echo "Could not get IP"
echo ""

# Run every 6 hours (21600 seconds)
INTERVAL=21600

while true; do
  echo "=========================================="
  echo "Starting status check at $(date)"
  echo "=========================================="

  # Sync WHOIS data (data/whois_gobve.json) into MongoDB before each check
  if [ -n "$MONGO_URI" ]; then
    node import-whois-to-mongo.js || echo "WHOIS import failed, continuing with status check"
  fi

  node check-status.js

  echo ""
  echo "Next check in $(($INTERVAL / 3600)) hours..."
  echo ""

  sleep $INTERVAL
done
