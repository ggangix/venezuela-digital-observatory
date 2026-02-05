# Venezuela Digital Observatory

Documenting Venezuela's government digital presence through public, structured data.

No exploits. No leaks. No personal data.

As of January 31th, 2026, this dataset includes 2530 `.gob.ve` and `mil.ve` domains.

---

## The problem

There is no public list of Venezuelan government domains.

NIC.VE, the official registry, doesn't publish one. There's no transparency portal, no open data initiative, no API. If you want to know what `.gob.ve` domains exist, you have to guess them one by one and query WHOIS manually.

This opacity makes it nearly impossible for citizens, journalists, or researchers to:
- Know which government websites exist
- Track when new ones are created
- Detect when domains change hands or expire
- Understand the digital footprint of the state

**This repository exists to change that.**

---

## What's here

Structured WHOIS data for `.gob.ve` domains, including:

- Domain name
- Registration and expiration dates
- Last modification date
- Organization (when available)
- Nameservers

---

## Files

```
data/
├── whois_gobve.json    # Full WHOIS dataset
└── whois_gobve.csv     # Spreadsheet-friendly

monitor/
├── index.html          # Live status dashboard
├── status.json         # Current availability data
└── check-status.js     # Status checker script
```

## Live Status Dashboard

Real-time availability monitoring of all `.gob.ve` domains:

**[View Dashboard](https://ggangix.github.io/venezuela-digital-observatory/)**

The dashboard shows:
- Online/offline status for each domain
- HTTP response codes
- SSL certificate status
- Response times

Status is updated periodically via GitHub Actions.

---

## Use cases

- **Journalists**: Investigate when government sites appear or disappear
- **Researchers**: Study digital governance patterns
- **Developers**: Build monitoring tools without scraping opaque systems
- **Citizens**: Hold institutions accountable

---

## Methodology

This is public information—anyone can query it, but nobody had compiled it until now. Personal data has been deliberately removed.

---

## Future scope

This project started with domain WHOIS data and now includes availability monitoring. Future expansions may include:
- DNS changes over time
- TLS/SSL certificate history
- Historical availability trends
- Other observable signals of government digital presence

---

## Self-hosting

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ggangix/venezuela-digital-observatory
   cd venezuela-digital-observatory
   ```

2. **Start MongoDB** (if not already running):
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:7

   # Or use your existing MongoDB instance
   ```

3. **Import seed data:**
   ```bash
   # Import the included seed data (recommended for quick start)
   ./scripts/import-seed.sh "mongodb://localhost:27017/ve_monitor"
   ```

   > **Note:** The `seed/` directory contains pre-exported JSON files with domain monitoring data and WHOIS information. This is the fastest way to get started.

   Alternatively, if you want to run a fresh monitor check:
   ```bash
   cd monitor
   npm install
   MONGO_URI=mongodb://localhost:27017/ve_monitor node import-to-mongo.js status.json
   ```

4. **Start the dashboard:**
   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

5. **Open** http://localhost:3000

### Seed Data

The repository includes seed data in the `seed/` directory for quick setup:

| File | Description |
|------|-------------|
| `ve_monitor_checks.json` | Check run metadata (timestamps, duration, stats) |
| `ve_monitor_domains.json` | Domain monitoring results (status, SSL, headers, response times) |
| `ve_monitor_whois.json` | WHOIS data (registrar, registration dates, nameservers) |

**Import seed data:**
```bash
./scripts/import-seed.sh "mongodb://localhost:27017/ve_monitor"
```

**Export fresh data** (after running the monitor):
```bash
./scripts/export-seed.sh "mongodb://localhost:27017/ve_monitor"
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/ve_monitor` |
| `NEXT_PUBLIC_SITE_URL` | Public URL for meta tags | `https://venezueladigitalobservatory.com` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics ID (optional) | - |

### Monitor Configuration

Environment variables for `monitor/check-status.js`:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATA_FILE` | `../data/whois_gobve.json` | Input domains list. |
| `OUTPUT_FILE` | `monitor/status.json` | Output status JSON. |
| `MONGO_URI` | - | Enables MongoDB writes when set. |
| `TIMEOUT_MS` | `30000` | Lower is faster, higher is more accurate for slow sites. |
| `CONCURRENCY` | `50` | Higher is faster but can increase timeouts. |
| `MAX_CONCURRENCY` | auto | Max lanes during slow-ramp; higher is faster but riskier. |
| `MAX_REDIRECTS` | `3` | Higher can improve accuracy for redirect-heavy sites. |
| `RETRY_ATTEMPTS` | `2` | Lower is faster, higher can reduce false negatives. |
| `REQUEST_METHOD` | `GET` | `HEAD` is faster but may be blocked; falls back to GET on 403/405/501. |
| `KEEP_ALIVE` | `false` | `true` reduces handshake overhead; may stress servers. |
| `MAX_BODY_BYTES` | `65536` | Limits body read for GET; lower is faster. |
| `MAX_SOCKETS` | auto | Higher allows more parallel connections. |
| `MAX_FREE_SOCKETS` | `32` | Keep-alive pool size. |
| `FAST_TIMEOUT_MS` | `3000` | Fast-lane demotion threshold. Lower favors speed. |
| `FAST_LANE_RATIO` | `0.2` | Share of fast-lane slots (0-0.9). |
| `DISPLAY_INTERVAL_MS` | `3000` | Progress display interval. |
| `SLOW_RAMP_STEP` | `10` | How quickly slow lanes scale up or down. |
| `SLOW_RAMP_INTERVAL_MS` | `15000` | Ramp evaluation interval. |
| `SLOW_RAMP_QUEUE_THRESHOLD` | `100` | Minimum queue before ramp logic activates. |
| `SLOW_RAMP_MAX_TIMEOUT_PCT` | `0.1` | Timeout threshold before ramping down. |
| `SLOW_RAMP_MIN_COMPLETIONS` | `5` | Minimum completions before evaluating ramp. |
| `FORCE_IPV4` | `false` | `true` skips IPv6; often faster on Linux. |
| `SKIP_DNS_RETRIES` | `false` | `true` skips retries for DNS errors; faster but less tolerant of flaky DNS. |
| `REACHABILITY_ENABLED` | `true` | Collect DNS + TCP reachability signals. |
| `DNS_TIMEOUT_MS` | `5000` | DNS lookup timeout for reachability. |
| `TCP_TIMEOUT_MS` | `5000` | TCP connect timeout for reachability. |
| `TCP_PORTS` | `443,80` | TCP ports to probe, in order. |
| `SECOND_PASS_ENABLED` | `true` | Recheck offline domains with longer timeouts. |
| `SECOND_PASS_TIMEOUT_MS` | `45000` | HTTP timeout for the second pass. |
| `SECOND_PASS_DNS_TIMEOUT_MS` | `8000` | DNS timeout for the second pass. |
| `SECOND_PASS_TCP_TIMEOUT_MS` | `8000` | TCP timeout for the second pass. |
| `SECOND_PASS_CONCURRENCY` | `15` | Concurrency for the second pass. |
| `SECOND_PASS_RETRY_ATTEMPTS` | `2` | Retry count for the second pass. |
| `LOG_MODE` | `progress` | `progress` shows the spinner only, `stream` logs key events, `fail` logs only offline + demote events. |
| `LOG_CHECKPOINT_MS` | `30000` | Checkpoint interval for `stream`/`fail` modes. |
| `LOG_FILE` | - | Write JSONL events to a file (use with `stream`/`fail`). |
| `LOG_COLOR` | auto | `false` disables ANSI colors. |

Speed vs accuracy tips:

1. Speed: set `SKIP_DNS_RETRIES=true`.
2. Speed: set `FORCE_IPV4=true`.
3. Speed: set `UV_THREADPOOL_SIZE=64` or `128` to reduce DNS bottlenecks.
4. Speed: increase `CONCURRENCY` or `MAX_CONCURRENCY`.
5. Accuracy: increase `TIMEOUT_MS` or `RETRY_ATTEMPTS`.
6. Accuracy: keep `REQUEST_METHOD=GET` (best compatibility).
7. Debug: set `LOG_MODE=stream` for per-domain events, or `LOG_MODE=fail` to only log failures.
8. Accuracy: enable `SECOND_PASS_ENABLED=true` to recheck offline domains with longer timeouts.

### Docker

```bash
# Build and run
docker-compose up -d

# Or build individually
cd dashboard
docker build -t ve-dashboard .
docker run -p 3000:3000 -e MONGO_URI=mongodb://host:27017/ve_monitor ve-dashboard
```

---

## License

- **Code**: [MIT License](LICENSE)
- **Data** (`data/`, `monitor/status.json`): [CC0 (Public Domain)](https://creativecommons.org/publicdomain/zero/1.0/)

---

## Disclaimer

Independent civic project. Not affiliated with the Venezuelan government or NIC.VE.

Data provided "as is".

---

## Support this work

- Buy me a coffee: [https://buymeacoffee.com/giuseppe.gangi](https://buymeacoffee.com/giuseppe.gangi)

*Documenting systems, not people.*
