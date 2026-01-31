const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Config
const TIMEOUT_MS = 10000; // 10 seconds
const CONCURRENCY = 20; // parallel requests
const DATA_FILE = path.join(__dirname, '../data/whois_gobve.json');
const OUTPUT_FILE = path.join(__dirname, 'status.json');

// Colors for console
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

// Check single domain
function checkDomain(domain) {
  return new Promise((resolve) => {
    const url = `https://${domain}`;
    const startTime = Date.now();

    const req = https.request(url, {
      method: 'HEAD',
      timeout: TIMEOUT_MS,
      rejectUnauthorized: false, // Accept invalid SSL
    }, (res) => {
      const responseTime = Date.now() - startTime;
      resolve({
        domain,
        status: 'online',
        httpCode: res.statusCode,
        responseTime,
        ssl: true,
        checkedAt: new Date().toISOString(),
      });
    });

    req.on('error', (err) => {
      // Try HTTP if HTTPS fails
      const httpReq = http.request(`http://${domain}`, {
        method: 'HEAD',
        timeout: TIMEOUT_MS,
      }, (res) => {
        const responseTime = Date.now() - startTime;
        resolve({
          domain,
          status: 'online',
          httpCode: res.statusCode,
          responseTime,
          ssl: false,
          checkedAt: new Date().toISOString(),
        });
      });

      httpReq.on('error', () => {
        resolve({
          domain,
          status: 'offline',
          httpCode: null,
          responseTime: null,
          ssl: null,
          error: err.code || err.message,
          checkedAt: new Date().toISOString(),
        });
      });

      httpReq.on('timeout', () => {
        httpReq.destroy();
        resolve({
          domain,
          status: 'offline',
          httpCode: null,
          responseTime: null,
          ssl: null,
          error: 'TIMEOUT',
          checkedAt: new Date().toISOString(),
        });
      });

      httpReq.end();
    });

    req.on('timeout', () => {
      req.destroy();
    });

    req.end();
  });
}

// Process domains in batches
async function processBatch(domains, batchSize) {
  const results = [];
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkDomain));
    results.push(...batchResults);

    // Progress
    const done = Math.min(i + batchSize, domains.length);
    const pct = Math.round((done / domains.length) * 100);
    const online = results.filter(r => r.status === 'online').length;
    const offline = results.filter(r => r.status === 'offline').length;
    process.stdout.write(`\r[${pct}%] ${done}/${domains.length} - ${C.green}${online} online${C.reset} / ${C.red}${offline} offline${C.reset}    `);
  }
  console.log('');
  return results;
}

async function main() {
  console.log('\n=== Venezuela Digital Observatory - Status Check ===\n');

  // Load domains
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const domains = data.domains.map(d => d.domain);

  console.log(`Checking ${domains.length} domains...`);
  console.log(`Timeout: ${TIMEOUT_MS}ms, Concurrency: ${CONCURRENCY}\n`);

  const startTime = Date.now();
  const results = await processBatch(domains, CONCURRENCY);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Stats
  const online = results.filter(r => r.status === 'online');
  const offline = results.filter(r => r.status === 'offline');
  const withSSL = online.filter(r => r.ssl === true);
  const avgResponse = online.length > 0
    ? Math.round(online.reduce((sum, r) => sum + r.responseTime, 0) / online.length)
    : 0;

  // Output
  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      totalDomains: domains.length,
      online: online.length,
      offline: offline.length,
      withSSL: withSSL.length,
      avgResponseTime: avgResponse,
      checkDuration: `${elapsed}s`,
    },
    domains: results.sort((a, b) => {
      // Online first, then by domain name
      if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
      return a.domain.localeCompare(b.domain);
    }),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  // Summary
  console.log('\n=== Summary ===\n');
  console.log(`  ${C.green}Online:${C.reset}   ${online.length} (${Math.round(online.length/domains.length*100)}%)`);
  console.log(`  ${C.red}Offline:${C.reset}  ${offline.length} (${Math.round(offline.length/domains.length*100)}%)`);
  console.log(`  ${C.yellow}With SSL:${C.reset} ${withSSL.length}`);
  console.log(`  ${C.dim}Avg response:${C.reset} ${avgResponse}ms`);
  console.log(`  ${C.dim}Duration:${C.reset} ${elapsed}s`);
  console.log(`\n  Output: ${OUTPUT_FILE}\n`);
}

main().catch(console.error);
