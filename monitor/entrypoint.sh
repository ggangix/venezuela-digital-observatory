#!/bin/sh

# Wait for VPN to be ready (check if we can reach the internet through VPN)
echo "Waiting for VPN connection..."
sleep 30

# Check VPN IP
echo "Current IP:"
wget -qO- https://ipinfo.io/ip || echo "Could not get IP"
echo ""

# Run every 6 hours (21600 seconds)
INTERVAL=${CHECK_INTERVAL:-21600}
# When the VPN is down, retry sooner instead of saving a check full of false outages
RETRY_INTERVAL=${VPN_RETRY_INTERVAL:-900}

# Build per-domain state and change events from the full history (only if missing)
if [ -n "$MONGO_URI" ]; then
  node rebuild-history.js || echo "History rebuild failed, continuing"
fi

vpn_ok() {
  wget -q -T 15 -O /dev/null https://ipinfo.io/ip && wget -q -T 15 -O /dev/null https://www.google.com
}

while true; do
  if ! vpn_ok; then
    echo "$(date): no connectivity through VPN, skipping check. Retrying in $(($RETRY_INTERVAL / 60)) minutes..."
    sleep $RETRY_INTERVAL
    continue
  fi

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
