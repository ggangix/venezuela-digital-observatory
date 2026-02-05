# Database Seed Files

This directory contains seed data for the Venezuela Digital Observatory MongoDB database.

## Collections

- `ve_monitor_checks.json` - Check run metadata (timestamps, stats)
- `ve_monitor_domains.json` - Domain monitoring results (status, SSL, headers, etc.)
- `ve_monitor_whois.json` - WHOIS data for domains (registrar, dates, nameservers)

## Importing the Seed Data

### Prerequisites

- MongoDB Tools installed (`mongoimport` command available)
- A MongoDB instance running

### Import Command

```bash
# Using the script
./scripts/import-seed.sh "mongodb://localhost:27017/ve_monitor"

# Or manually with mongoimport
mongoimport --uri="mongodb://localhost:27017/ve_monitor" \
  --collection=ve_monitor_domains \
  --file=seed/ve_monitor_domains.json \
  --jsonArray \
  --drop
```

### Using Docker

If you're using Docker Compose with the included `docker-compose.yml`:

```bash
# Start MongoDB
docker-compose up -d mongo

# Import seed data
./scripts/import-seed.sh "mongodb://localhost:27017/ve_monitor"
```

## Exporting Updated Data

To export fresh data from your MongoDB:

```bash
./scripts/export-seed.sh "mongodb://localhost:27017/ve_monitor"
```

## License

The data in this directory is released under **CC0 (Public Domain)**.
