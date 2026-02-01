const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Config
const TIMEOUT_MS = 15000; // 15 seconds (some VE servers are slow)
const CONCURRENCY = 15; // parallel requests (reduced to avoid overwhelming slow servers)
const DATA_FILE = path.join(__dirname, '../data/whois_gobve.json');
const OUTPUT_FILE = path.join(__dirname, 'status.json');

// Headers to mimic a real browser
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
  'Connection': 'close',
};

// Colors for console
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};

// HTTP codes that indicate HEAD is not supported
const HEAD_UNSUPPORTED_CODES = [405, 501, 400];

// Make a single request (HEAD or GET)
function makeRequest(protocol, domain, method, timeout) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const options = {
      method,
      timeout,
      headers: HEADERS,
      rejectUnauthorized: false, // Accept invalid SSL
    };

    const req = protocol.request(`${protocol === https ? 'https' : 'http'}://${domain}`, options, (res) => {
      const responseTime = Date.now() - startTime;
      // For GET, abort immediately after getting headers
      if (method === 'GET') {
        req.destroy();
      }
      resolve({
        success: true,
        httpCode: res.statusCode,
        responseTime,
        ssl: protocol === https,
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.code || err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'TIMEOUT' });
    });

    req.end();
  });
}

// Check single domain with HEAD -> GET fallback
function checkDomain(domain) {
  return new Promise(async (resolve) => {
    // Try HTTPS HEAD first
    let result = await makeRequest(https, domain, 'HEAD', TIMEOUT_MS);

    // If HEAD returned unsupported code, retry with GET
    if (result.success && HEAD_UNSUPPORTED_CODES.includes(result.httpCode)) {
      result = await makeRequest(https, domain, 'GET', TIMEOUT_MS);
    }

    // If HTTPS succeeded
    if (result.success) {
      return resolve({
        domain,
        status: 'online',
        httpCode: result.httpCode,
        responseTime: result.responseTime,
        ssl: true,
        checkedAt: new Date().toISOString(),
      });
    }

    // Try HTTP HEAD
    result = await makeRequest(http, domain, 'HEAD', TIMEOUT_MS);

    // If HEAD returned unsupported code, retry with GET
    if (result.success && HEAD_UNSUPPORTED_CODES.includes(result.httpCode)) {
      result = await makeRequest(http, domain, 'GET', TIMEOUT_MS);
    }

    // If HTTP succeeded
    if (result.success) {
      return resolve({
        domain,
        status: 'online',
        httpCode: result.httpCode,
        responseTime: result.responseTime,
        ssl: false,
        checkedAt: new Date().toISOString(),
      });
    }

    // Both failed
    resolve({
      domain,
      status: 'offline',
      httpCode: null,
      responseTime: null,
      ssl: null,
      error: result.error,
      checkedAt: new Date().toISOString(),
    });
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
