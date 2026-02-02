const https = require('https');
const http = require('http');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Config
const TIMEOUT_MS = 15000;
const CONCURRENCY = 15;
const MAX_REDIRECTS = 5;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '../data/whois_gobve.json');
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.join(__dirname, 'status.json');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ve_monitor';

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

// Get SSL certificate information
function getSSLInfo(domain) {
  return new Promise((resolve) => {
    const socket = tls.connect(443, domain, {
      rejectUnauthorized: false,
      timeout: 5000
    }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.destroy();

        if (!cert || !cert.subject) {
          return resolve(null);
        }

        const validTo = new Date(cert.valid_to);
        const validFrom = new Date(cert.valid_from);
        const now = new Date();
        const daysUntilExpiry = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

        resolve({
          enabled: true,
          valid: socket.authorized,
          issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
          subject: cert.subject?.CN || domain,
          validFrom: validFrom,
          validTo: validTo,
          daysUntilExpiry,
          selfSigned: (cert.issuer?.CN === cert.subject?.CN) ||
                      (cert.issuer?.O === cert.subject?.O && !cert.issuer?.O)
        });
      } catch (e) {
        socket.destroy();
        resolve(null);
      }
    });

    socket.on('error', () => resolve(null));
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(null);
    });
  });
}

// Extract relevant headers from response
function extractHeaders(res) {
  const h = res.headers || {};
  return {
    server: h['server'] || null,
    contentType: h['content-type'] || null,
    poweredBy: h['x-powered-by'] || null,
    via: h['via'] || null,
    cacheControl: h['cache-control'] || null,
    contentLength: h['content-length'] ? parseInt(h['content-length']) : null,
    lastModified: h['last-modified'] || null,
  };
}

// Make a single request and return headers
function makeRequest(urlString, method = 'GET', timeout = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return resolve({ success: false, error: 'INVALID_URL' });
    }

    const protocol = url.protocol === 'https:' ? https : http;
    const options = {
      method,
      timeout,
      headers: HEADERS,
      rejectUnauthorized: false,
    };

    const req = protocol.request(url, options, (res) => {
      const responseTime = Date.now() - startTime;

      // Get redirect location if present
      let location = res.headers['location'] || null;
      if (location && !location.startsWith('http')) {
        // Handle relative redirects
        location = new URL(location, urlString).href;
      }

      // For GET, abort immediately after getting headers
      if (method === 'GET') {
        req.destroy();
      }

      resolve({
        success: true,
        httpCode: res.statusCode,
        responseTime,
        headers: extractHeaders(res),
        location,
        ssl: url.protocol === 'https:',
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

// Check single domain with redirect following
async function checkDomain(domain) {
  const redirects = [];
  let currentUrl = `https://${domain}`;
  let result = null;
  let usedHttps = true;
  let sslInfo = null;

  // Get SSL info first (only for HTTPS)
  sslInfo = await getSSLInfo(domain);

  // Follow redirects
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    result = await makeRequest(currentUrl, 'HEAD', TIMEOUT_MS);

    // If HEAD returned unsupported code, retry with GET
    if (result.success && HEAD_UNSUPPORTED_CODES.includes(result.httpCode)) {
      result = await makeRequest(currentUrl, 'GET', TIMEOUT_MS);
    }

    // If HTTPS failed on first attempt, try HTTP
    if (!result.success && i === 0 && usedHttps) {
      usedHttps = false;
      currentUrl = `http://${domain}`;
      sslInfo = null; // No SSL for HTTP

      result = await makeRequest(currentUrl, 'HEAD', TIMEOUT_MS);
      if (result.success && HEAD_UNSUPPORTED_CODES.includes(result.httpCode)) {
        result = await makeRequest(currentUrl, 'GET', TIMEOUT_MS);
      }
    }

    if (!result.success) {
      break;
    }

    // Check for redirect
    if (result.httpCode >= 300 && result.httpCode < 400 && result.location) {
      redirects.push({
        url: currentUrl,
        statusCode: result.httpCode
      });
      currentUrl = result.location;

      // If redirecting from HTTP to HTTPS, get SSL info
      if (currentUrl.startsWith('https://') && !sslInfo) {
        const redirectDomain = new URL(currentUrl).hostname;
        sslInfo = await getSSLInfo(redirectDomain);
      }
    } else {
      // Not a redirect, we're done
      break;
    }
  }

  const checkedAt = new Date();

  if (result && result.success) {
    return {
      domain,
      status: 'online',
      httpCode: result.httpCode,
      responseTime: result.responseTime,
      ssl: sslInfo,
      headers: result.headers,
      redirects: redirects.length > 0 ? redirects : null,
      finalUrl: redirects.length > 0 ? currentUrl : null,
      checkedAt,
    };
  }

  // Both failed
  return {
    domain,
    status: 'offline',
    httpCode: null,
    responseTime: null,
    ssl: null,
    headers: null,
    redirects: null,
    finalUrl: null,
    error: result?.error || 'UNKNOWN',
    checkedAt,
  };
}

// Process domains in batches
async function processBatch(domains, batchSize) {
  const results = [];
  let lastPct = 0;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkDomain));
    results.push(...batchResults);

    // Progress
    const done = Math.min(i + batchSize, domains.length);
    const pct = Math.round((done / domains.length) * 100);
    const online = results.filter(r => r.status === 'online').length;
    const offline = results.filter(r => r.status === 'offline').length;

    if (process.stdout.isTTY) {
      process.stdout.write(`\r[${pct}%] ${done}/${domains.length} - ${C.green}${online} online${C.reset} / ${C.red}${offline} offline${C.reset}    `);
    } else if (pct >= lastPct + 5 || done === domains.length) {
      console.log(`[${pct}%] ${done}/${domains.length} - ${online} online / ${offline} offline`);
      lastPct = pct;
    }
  }

  if (process.stdout.isTTY) console.log('');
  return results;
}

// Save to MongoDB
async function saveToMongoDB(results, summary, checkDuration) {
  let client;

  try {
    console.log(`\nConnecting to MongoDB: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    client = new MongoClient(MONGO_URI);
    await client.connect();

    const db = client.db();
    const checksCollection = db.collection('ve_monitor_checks');
    const domainsCollection = db.collection('ve_monitor_domains');

    // Create indexes if they don't exist
    await domainsCollection.createIndex({ domain: 1, checkedAt: -1 });
    await domainsCollection.createIndex({ checkId: 1 });
    await domainsCollection.createIndex({ checkedAt: -1 });
    await checksCollection.createIndex({ checkedAt: -1 });

    // Insert check record
    const checkRecord = {
      checkedAt: new Date(),
      checkDuration,
      summary
    };
    const checkResult = await checksCollection.insertOne(checkRecord);
    const checkId = checkResult.insertedId;

    // Prepare domain records with checkId
    const domainRecords = results.map(r => ({
      checkId,
      checkedAt: r.checkedAt,
      domain: r.domain,
      status: r.status,
      httpCode: r.httpCode,
      responseTime: r.responseTime,
      error: r.error || null,
      ssl: r.ssl,
      headers: r.headers,
      redirects: r.redirects,
      finalUrl: r.finalUrl
    }));

    // Bulk insert domain records
    await domainsCollection.insertMany(domainRecords);

    console.log(`${C.green}Saved to MongoDB:${C.reset} 1 check + ${results.length} domain records`);

    // Get total count
    const totalChecks = await checksCollection.countDocuments();
    const totalDomainRecords = await domainsCollection.countDocuments();
    console.log(`${C.dim}Total in DB: ${totalChecks} checks, ${totalDomainRecords} domain records${C.reset}`);

  } catch (err) {
    console.error(`${C.red}MongoDB Error:${C.reset} ${err.message}`);
    console.log(`${C.yellow}Continuing without MongoDB...${C.reset}`);
  } finally {
    if (client) {
      await client.close();
    }
  }
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
  const withSSL = online.filter(r => r.ssl?.enabled === true);
  const validSSL = online.filter(r => r.ssl?.valid === true);
  const avgResponse = online.length > 0
    ? Math.round(online.reduce((sum, r) => sum + r.responseTime, 0) / online.length)
    : 0;

  const summary = {
    totalDomains: domains.length,
    online: online.length,
    offline: offline.length,
    withSSL: withSSL.length,
    validSSL: validSSL.length,
    avgResponseTime: avgResponse,
  };

  // Save to MongoDB
  await saveToMongoDB(results, summary, parseFloat(elapsed));

  // Output JSON file (for compatibility)
  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      ...summary,
      checkDuration: `${elapsed}s`,
    },
    domains: results.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
      return a.domain.localeCompare(b.domain);
    }),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  // Summary
  console.log('\n=== Summary ===\n');
  console.log(`  ${C.green}Online:${C.reset}     ${online.length} (${Math.round(online.length/domains.length*100)}%)`);
  console.log(`  ${C.red}Offline:${C.reset}    ${offline.length} (${Math.round(offline.length/domains.length*100)}%)`);
  console.log(`  ${C.yellow}With SSL:${C.reset}   ${withSSL.length}`);
  console.log(`  ${C.yellow}Valid SSL:${C.reset}  ${validSSL.length}`);
  console.log(`  ${C.dim}Avg response:${C.reset} ${avgResponse}ms`);
  console.log(`  ${C.dim}Duration:${C.reset} ${elapsed}s`);
  console.log(`\n  Output: ${OUTPUT_FILE}\n`);
}

main().catch(console.error);
