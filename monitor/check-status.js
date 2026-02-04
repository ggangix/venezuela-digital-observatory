const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '30000', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '50', 10));
const DEFAULT_MAX_CONCURRENCY = Math.min(1000, Math.max(CONCURRENCY * 4, CONCURRENCY + 50));
const MAX_CONCURRENCY_RAW = parseInt(process.env.MAX_CONCURRENCY || String(DEFAULT_MAX_CONCURRENCY), 10);
const MAX_CONCURRENCY = Math.max(CONCURRENCY, MAX_CONCURRENCY_RAW);
const MAX_REDIRECTS = Math.max(0, parseInt(process.env.MAX_REDIRECTS || '3', 10));
const RETRY_ATTEMPTS = Math.max(0, parseInt(process.env.RETRY_ATTEMPTS || '2', 10));
const REQUEST_METHOD = (process.env.REQUEST_METHOD || 'GET').toUpperCase();
const KEEP_ALIVE = (process.env.KEEP_ALIVE || 'false').toLowerCase() === 'true';
const MAX_BODY_BYTES = Math.max(0, parseInt(process.env.MAX_BODY_BYTES || '65536', 10));
const MAX_SOCKETS = Math.max(MAX_CONCURRENCY * 2, parseInt(process.env.MAX_SOCKETS || '128', 10));
const MAX_FREE_SOCKETS = Math.max(0, parseInt(process.env.MAX_FREE_SOCKETS || '32', 10));
const FAST_TIMEOUT_MS = Math.max(0, parseInt(process.env.FAST_TIMEOUT_MS || '3000', 10));
const FAST_LANE_RATIO_RAW = parseFloat(process.env.FAST_LANE_RATIO || '0.2');
const FAST_LANE_RATIO = Number.isFinite(FAST_LANE_RATIO_RAW)
  ? Math.max(0, Math.min(0.9, FAST_LANE_RATIO_RAW))
  : 0.2;
const DISPLAY_INTERVAL_MS = Math.max(500, parseInt(process.env.DISPLAY_INTERVAL_MS || '3000', 10));
const SLOW_RAMP_STEP = Math.max(1, parseInt(process.env.SLOW_RAMP_STEP || '10', 10));
const SLOW_RAMP_INTERVAL_MS = Math.max(1000, parseInt(process.env.SLOW_RAMP_INTERVAL_MS || '15000', 10));
const SLOW_RAMP_QUEUE_THRESHOLD = Math.max(0, parseInt(process.env.SLOW_RAMP_QUEUE_THRESHOLD || '100', 10));
const SLOW_RAMP_MAX_TIMEOUT_PCT_RAW = parseFloat(process.env.SLOW_RAMP_MAX_TIMEOUT_PCT || '0.1');
const SLOW_RAMP_MAX_TIMEOUT_PCT = Number.isFinite(SLOW_RAMP_MAX_TIMEOUT_PCT_RAW)
  ? Math.max(0, Math.min(1, SLOW_RAMP_MAX_TIMEOUT_PCT_RAW))
  : 0.1;
const SLOW_RAMP_MIN_COMPLETIONS = Math.max(1, parseInt(process.env.SLOW_RAMP_MIN_COMPLETIONS || '5', 10));
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '../data/whois_gobve.json');
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.join(__dirname, 'status.json');
const MONGO_URI = process.env.MONGO_URI;
const MONGO_ENABLED = !!MONGO_URI;
const FORCE_IPV4 = (process.env.FORCE_IPV4 || 'false').toLowerCase() === 'true';
const SKIP_DNS_RETRIES = (process.env.SKIP_DNS_RETRIES || 'false').toLowerCase() === 'true';
const REACHABILITY_ENABLED = (process.env.REACHABILITY_ENABLED || 'true').toLowerCase() === 'true';
const DNS_TIMEOUT_MS = Math.max(0, parseInt(process.env.DNS_TIMEOUT_MS || '5000', 10));
const TCP_TIMEOUT_MS = Math.max(0, parseInt(process.env.TCP_TIMEOUT_MS || '5000', 10));
const TCP_PORTS_RAW = (process.env.TCP_PORTS || '443,80')
  .split(',')
  .map(value => parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0);
const TCP_PORTS = TCP_PORTS_RAW.length > 0 ? TCP_PORTS_RAW : [443, 80];
const SECOND_PASS_ENABLED = (process.env.SECOND_PASS_ENABLED || 'true').toLowerCase() === 'true';
const SECOND_PASS_CONCURRENCY = Math.max(1, parseInt(process.env.SECOND_PASS_CONCURRENCY || '15', 10));
const SECOND_PASS_TIMEOUT_MS = Math.max(0, parseInt(process.env.SECOND_PASS_TIMEOUT_MS || '45000', 10));
const SECOND_PASS_DNS_TIMEOUT_MS = Math.max(0, parseInt(process.env.SECOND_PASS_DNS_TIMEOUT_MS || '8000', 10));
const SECOND_PASS_TCP_TIMEOUT_MS = Math.max(0, parseInt(process.env.SECOND_PASS_TCP_TIMEOUT_MS || '8000', 10));
const SECOND_PASS_RETRY_ATTEMPTS = Math.max(0, parseInt(process.env.SECOND_PASS_RETRY_ATTEMPTS || String(RETRY_ATTEMPTS), 10));
const LOG_MODE_RAW = (process.env.LOG_MODE || 'progress').toLowerCase();
const LOG_MODE = ['progress', 'stream', 'fail'].includes(LOG_MODE_RAW) ? LOG_MODE_RAW : 'progress';
const LOG_CHECKPOINT_MS = Math.max(1000, parseInt(process.env.LOG_CHECKPOINT_MS || '30000', 10));
const LOG_FILE = process.env.LOG_FILE || '';
const LOG_COLOR_RAW = (process.env.LOG_COLOR || '').toLowerCase();
const LOG_COLOR = LOG_COLOR_RAW
  ? !['0', 'false', 'no', 'off'].includes(LOG_COLOR_RAW)
  : process.stdout.isTTY;

// Headers to mimic a real browser
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
};

// Colors for console
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
};

// Shared agents (optional keep-alive)
const httpAgent = new http.Agent({ keepAlive: KEEP_ALIVE, maxSockets: MAX_SOCKETS, maxFreeSockets: MAX_FREE_SOCKETS });
const httpsAgent = new https.Agent({ keepAlive: KEEP_ALIVE, maxSockets: MAX_SOCKETS, maxFreeSockets: MAX_FREE_SOCKETS });

// Errors worth retrying
const DNS_ERRORS = ['EAI_AGAIN', 'ENOTFOUND', 'DNS_TIMEOUT', 'DNS_FAIL', 'DNS_NO_RECORDS'];
const RETRYABLE_ERRORS_BASE = ['TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', ...DNS_ERRORS];
const RETRYABLE_ERRORS = SKIP_DNS_RETRIES
  ? RETRYABLE_ERRORS_BASE.filter(error => !DNS_ERRORS.includes(error))
  : RETRYABLE_ERRORS_BASE;

function withTimeout(promise, ms, timeoutCode) {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(timeoutCode);
      err.code = timeoutCode;
      reject(err);
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function resolveDNS(domain, timeoutMs = DNS_TIMEOUT_MS) {
  const start = Date.now();
  const [v4Result, v6Result] = await Promise.allSettled([
    withTimeout(dns.resolve4(domain), timeoutMs, 'DNS_TIMEOUT'),
    withTimeout(dns.resolve6(domain), timeoutMs, 'DNS_TIMEOUT'),
  ]);

  const v4 = v4Result.status === 'fulfilled' ? v4Result.value : [];
  const v6 = v6Result.status === 'fulfilled' ? v6Result.value : [];
  const ips = [...v4, ...v6];

  let error = null;
  if (ips.length === 0) {
    const err = v4Result.status === 'rejected'
      ? v4Result.reason
      : v6Result.status === 'rejected'
        ? v6Result.reason
        : null;
    error = err?.code || err?.message || 'DNS_NO_RECORDS';
  }

  return {
    ok: ips.length > 0,
    v4,
    v6,
    ips,
    error,
    timeMs: Date.now() - start,
  };
}

function pickTcpTarget(domain, dnsInfo) {
  const v4 = dnsInfo?.v4 || [];
  const v6 = dnsInfo?.v6 || [];
  if (FORCE_IPV4 && v4.length > 0) {
    return { host: v4[0], family: 4 };
  }
  if (v4.length > 0) {
    return { host: v4[0], family: 4 };
  }
  if (v6.length > 0) {
    return { host: v6[0], family: 6 };
  }
  return { host: domain, family: undefined };
}

function probeTcp(host, port, family, timeoutMs = TCP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, error: error || null, timeMs: Date.now() - start });
    };

    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => finish(false, 'TCP_TIMEOUT'), timeoutMs);
    }

    socket.once('connect', () => {
      if (timer) clearTimeout(timer);
      finish(true, null);
    });

    socket.once('error', (err) => {
      if (timer) clearTimeout(timer);
      finish(false, err?.code || err?.message || 'TCP_ERROR');
    });

    socket.connect({ host, port, family });
  });
}

async function checkTcp(domain, dnsInfo, timeoutMs = TCP_TIMEOUT_MS, ports = TCP_PORTS) {
  const target = pickTcpTarget(domain, dnsInfo);
  let lastError = null;
  let lastTime = null;
  let lastPort = null;

  for (const port of ports) {
    lastPort = port;
    const result = await probeTcp(target.host, port, target.family, timeoutMs);
    lastTime = result.timeMs;
    if (result.ok) {
      return { ok: true, port, timeMs: result.timeMs, error: null };
    }
    lastError = result.error;
  }

  return {
    ok: false,
    port: lastPort,
    timeMs: lastTime,
    error: lastError || 'TCP_FAIL',
  };
}

async function getReachability(domain, overrides = {}) {
  if (!REACHABILITY_ENABLED) return null;
  const dnsTimeoutMs = Number.isFinite(overrides.dnsTimeoutMs) ? overrides.dnsTimeoutMs : DNS_TIMEOUT_MS;
  const tcpTimeoutMs = Number.isFinite(overrides.tcpTimeoutMs) ? overrides.tcpTimeoutMs : TCP_TIMEOUT_MS;
  const tcpPorts = Array.isArray(overrides.tcpPorts) && overrides.tcpPorts.length > 0
    ? overrides.tcpPorts
    : TCP_PORTS;
  const dnsInfo = await resolveDNS(domain, dnsTimeoutMs);
  let tcpInfo = null;
  if (!dnsInfo.ok) {
    tcpInfo = { ok: false, port: null, timeMs: null, error: 'DNS_FAIL' };
  } else {
    tcpInfo = await checkTcp(domain, dnsInfo, tcpTimeoutMs, tcpPorts);
  }
  return { dns: dnsInfo, tcp: tcpInfo };
}

// Extract SSL certificate information from an HTTPS response socket
function buildSSLInfo(socket, domain) {
  if (!socket || typeof socket.getPeerCertificate !== 'function') return null;

  try {
    const cert = socket.getPeerCertificate();
    if (!cert || !cert.subject) return null;

    const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
    const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
    const now = new Date();
    const daysUntilExpiry = validTo
      ? Math.floor((validTo - now) / (1000 * 60 * 60 * 24))
      : null;

    return {
      enabled: true,
      valid: socket.authorized === true,
      issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
      subject: cert.subject?.CN || domain,
      validFrom,
      validTo,
      daysUntilExpiry,
      selfSigned: (cert.issuer?.CN === cert.subject?.CN) ||
                  (cert.issuer?.O === cert.subject?.O && !cert.issuer?.O)
    };
  } catch (e) {
    return null;
  }
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
function makeRequest(urlString, method = 'GET', timeout = TIMEOUT_MS, abortSignal) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let settled = false;
    let wasAborted = false;
    let onAbort = null;
    const abortReason = typeof abortSignal?.reason === 'string' ? abortSignal.reason : 'ABORTED';

    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (abortSignal && onAbort) {
        try { abortSignal.removeEventListener('abort', onAbort); } catch (e) {}
      }
      resolve(value);
    };

    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return settle({ success: false, error: 'INVALID_URL' });
    }

    const protocol = url.protocol === 'https:' ? https : http;
    const headers = method === 'GET'
      ? { ...HEADERS, Range: 'bytes=0-0' }
      : HEADERS;

    const options = {
      method,
      timeout,
      headers,
      agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      rejectUnauthorized: false,
      family: FORCE_IPV4 ? 4 : undefined,
    };

    const req = protocol.request(url, options, (res) => {
      const responseTime = Date.now() - startTime;
      const sslInfo = url.protocol === 'https:' ? buildSSLInfo(res.socket, url.hostname) : null;

      // Get redirect location if present
      let location = res.headers['location'] || null;
      if (location && !location.startsWith('http')) {
        // Handle relative redirects
        location = new URL(location, urlString).href;
      }

      // For GET, abort immediately after getting headers
      if (method === 'GET') {
        if (KEEP_ALIVE) {
          let bytes = 0;
          res.on('data', (chunk) => {
            bytes += chunk.length;
            if (MAX_BODY_BYTES > 0 && bytes > MAX_BODY_BYTES) {
              req.destroy();
            }
          });
          res.resume();
        } else {
          req.destroy();
        }
      }

      settle({
        success: true,
        httpCode: res.statusCode,
        responseTime,
        headers: extractHeaders(res),
        location,
        ssl: sslInfo,
      });
    });

    req.on('error', (err) => {
      if (wasAborted) {
        return settle({ success: false, error: abortReason });
      }
      settle({ success: false, error: err.code || err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ success: false, error: 'TIMEOUT' });
    });

    onAbort = () => {
      wasAborted = true;
      req.destroy(new Error(abortReason));
      settle({ success: false, error: abortReason });
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        return settle({ success: false, error: abortReason });
      }
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    req.end();
  });
}

// Check single domain with redirect following
async function checkDomain(domain, options = {}) {
  const redirects = [];
  let currentUrl = `https://${domain}`;
  let result = null;
  let usedHttps = true;
  let sslInfo = null;
  const reachability = options.reachability || null;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : TIMEOUT_MS;
  const abortSignal = options.abortSignal;

  const primaryMethod = REQUEST_METHOD === 'HEAD' ? 'HEAD' : 'GET';
  const fallbackMethod = 'GET';

  if (REACHABILITY_ENABLED && reachability?.dns?.ok === false) {
    return {
      domain,
      status: 'offline',
      httpCode: null,
      responseTime: null,
      ssl: null,
      headers: null,
      redirects: null,
      finalUrl: null,
      error: reachability.dns.error || 'DNS_FAIL',
      checkedAt: new Date(),
      reachability,
    };
  }

  // Follow redirects - Default to GET for compatibility
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    result = await makeRequest(currentUrl, primaryMethod, timeoutMs, abortSignal);

    // If HEAD is blocked, retry once with GET to confirm status
    if (primaryMethod === 'HEAD' && result.success && [403, 405, 501].includes(result.httpCode)) {
      result = await makeRequest(currentUrl, fallbackMethod, timeoutMs, abortSignal);
    }

    // If HTTPS failed on first attempt, try HTTP
    if (!result.success && i === 0 && usedHttps) {
      usedHttps = false;
      currentUrl = `http://${domain}`;
      sslInfo = null; // No SSL for HTTP

      result = await makeRequest(currentUrl, primaryMethod, timeoutMs, abortSignal);

      if (primaryMethod === 'HEAD' && result.success && [403, 405, 501].includes(result.httpCode)) {
        result = await makeRequest(currentUrl, fallbackMethod, timeoutMs, abortSignal);
      }
    }

    if (!result.success) {
      break;
    }

    if (result.ssl) {
      sslInfo = result.ssl;
    }

    // Check for redirect
    if (result.httpCode >= 300 && result.httpCode < 400 && result.location) {
      redirects.push({
        url: currentUrl,
        statusCode: result.httpCode
      });
      currentUrl = result.location;
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
      reachability,
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
    reachability,
  };
}

// Check domain with retry logic
async function checkDomainWithRetry(domain, options = {}) {
  const retries = Number.isFinite(options.retries) ? Math.max(0, options.retries) : RETRY_ATTEMPTS;
  const reachability = options.reachability
    ? options.reachability
    : await getReachability(domain, options.reachabilityOverrides);
  const checkOptions = {
    abortSignal: options.abortSignal,
    reachability,
    timeoutMs: options.timeoutMs,
  };
  let result = await checkDomain(domain, checkOptions);

  if (result?.error === 'SLOW_DEMOTE') {
    return result;
  }

  // Retry if failed with retryable error
  if (retries > 0 && result.status === 'offline' && RETRYABLE_ERRORS.includes(result.error)) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      // Wait before retry (2s, 4s)
      await new Promise(r => setTimeout(r, attempt * 2000));
      result = await checkDomain(domain, checkOptions);
      if (result.status === 'online') break;
    }
  }

  return result;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatDomain(domain, width) {
  if (!domain) return ''.padEnd(width);
  if (domain.length > width) return `${domain.slice(0, width - 3)}...`;
  return domain.padEnd(width);
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(p * sortedValues.length) - 1));
  return sortedValues[index];
}

function makeProgressBar(pct, width = 10) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(Math.max(0, width - filled))}]`;
}

// Process domains with fast/slow lanes and demotion for slow checks
async function processWithConcurrency(domains, concurrency) {
  const results = new Array(domains.length);
  const fastQueue = domains.map((domain, index) => ({ domain, index }));
  const slowQueue = [];
  const total = domains.length;
  const logToConsole = LOG_MODE !== 'progress';
  const logToFile = !!LOG_FILE;
  const shouldLog = logToConsole || logToFile;
  const logTagWidth = 7;
  const logDomainWidth = 32;
  let logStream = null;
  if (logToFile) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    } catch (e) {}
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  }

  let fastLaneLimit = Math.floor(concurrency * FAST_LANE_RATIO);
  fastLaneLimit = Math.max(1, Math.min(fastLaneLimit, concurrency));
  let slowLaneLimit = Math.max(0, concurrency - fastLaneLimit);
  const minSlowLaneLimit = slowLaneLimit;
  const maxSlowLaneLimit = Math.max(0, MAX_CONCURRENCY - fastLaneLimit);

  console.log(`Lanes: FAST ${fastLaneLimit}, SLOW ${slowLaneLimit} (ratio ${FAST_LANE_RATIO}, fast timeout ${FAST_TIMEOUT_MS}ms)`);

  let inFlightFast = 0;
  let inFlightSlow = 0;
  let done = 0;
  let started = 0;
  const startedSet = new Set();
  let lastPct = 0;
  let online = 0;
  let offline = 0;
  let timeoutCount = 0;
  let lastDoneForRamp = 0;
  let lastTimeoutForRamp = 0;
  let spinIndex = 0;
  const spinChars = ['|', '/', '-', '\\'];
  const startTime = Date.now();
  let onlineResponseSum = 0;
  let dnsErrors = 0;
  let timeoutErrors = 0;
  let resetErrors = 0;
  let otherErrors = 0;

  const writeLog = (event, payload = {}) => {
    if (!shouldLog) return;
    const now = Date.now();
    if (logToFile && logStream) {
      const record = {
        ts: new Date(now).toISOString(),
        elapsedMs: now - startTime,
        event,
        ...payload,
      };
      logStream.write(`${JSON.stringify(record)}\n`);
    }
    if (!logToConsole) return;

    const tagText = event.padEnd(logTagWidth);
    let tagColor = '';
    if (event === 'ONLINE') tagColor = C.green;
    if (event === 'OFFLINE') tagColor = C.red;
    if (event === 'START') tagColor = C.cyan;
    if (event === 'DEMOTE' || event === 'RAMP') tagColor = C.yellow;
    if (event === 'CHECK') tagColor = C.dim;
    const tag = LOG_COLOR && tagColor ? `${tagColor}${tagText}${C.reset}` : tagText;

    const timestamp = formatElapsed(now - startTime);
    const details = payload.details || '';
    if (payload.omitDomain) {
      console.log(`${timestamp} | ${tag} | ${details}`);
    } else {
      const domain = formatDomain(payload.domain || '-', logDomainWidth);
      console.log(`${timestamp} | ${tag} | ${domain} | ${details}`);
    }
  };

  const logCheckpoint = () => {
    if (!shouldLog || LOG_MODE === 'progress') return;
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    const avgResponse = online > 0 ? Math.round(onlineResponseSum / online) : 0;
    const spinner = spinChars[spinIndex % spinChars.length];
    spinIndex++;
    const bar = makeProgressBar(pct, 12);
    const details = [
      `${spinner} ${bar} ${pct}%`,
      `DONE ${done}/${total}`,
      `ON ${online} OFF ${offline}`,
      `AVG ${formatMs(avgResponse)}`,
      `FAILS TIMEOUT ${timeoutErrors} DNS ${dnsErrors} RESET ${resetErrors} OTHER ${otherErrors}`,
    ].join(' | ');
    writeLog('CHECK', { details, omitDomain: true });
  };

  const renderProgress = (force = false) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    const now = Date.now();
    const elapsed = now - startTime;
    const rate = done > 0 ? elapsed / done : 0;
    const etaMs = done > 0 ? rate * (total - done) : 0;
    const eta = done > 0 ? formatDuration(etaMs) : '--';
    const spinner = spinChars[spinIndex % spinChars.length];
    spinIndex++;

    const lanesTextTTY = `${C.yellow}FAST${C.reset} ${inFlightFast}/${fastLaneLimit} ${C.dim}SLOW${C.reset} ${inFlightSlow}/${slowLaneLimit} ${C.dim}SQ${C.reset} ${slowQueue.length}`;
    const lanesTextPlain = `FAST ${inFlightFast}/${fastLaneLimit} SLOW ${inFlightSlow}/${slowLaneLimit} SQ ${slowQueue.length}`;
    const inFlight = inFlightFast + inFlightSlow;
    const queued = fastQueue.length + slowQueue.length;
    const waiting = queued + inFlight;

    if (process.stdout.isTTY) {
      process.stdout.write(
        `\r[${spinner}] Active ${inFlight} Waiting ${waiting} Total ${total} | Started ${started} Completed ${done} | ETA ${eta} RT ${formatDuration(elapsed)} ${C.green}ONLINE${C.reset} ${online} ${C.red}OFFLINE${C.reset} ${offline} ${lanesTextTTY}    `
      );
    } else if (force || pct >= lastPct + 5 || done === total) {
      console.log(`[${spinner}] Active ${inFlight} Waiting ${waiting} Total ${total} | Started ${started} Completed ${done} | ETA ${eta} RT ${formatDuration(elapsed)} ONLINE ${online} OFFLINE ${offline} ${lanesTextPlain}`);
      lastPct = pct;
    }
  };

  let progressTimer = null;
  if (process.stdout.isTTY && LOG_MODE === 'progress') {
    progressTimer = setInterval(() => renderProgress(false), DISPLAY_INTERVAL_MS);
  }

  let checkpointTimer = null;
  if (LOG_MODE !== 'progress') {
    checkpointTimer = setInterval(() => logCheckpoint(), LOG_CHECKPOINT_MS);
  }

  return new Promise((resolve) => {
    const logRamp = (message) => {
      if (LOG_MODE === 'progress') {
        if (process.stdout.isTTY) {
          process.stdout.write('\n');
        }
        console.log(message);
        return;
      }
      writeLog('RAMP', { details: message, omitDomain: true });
    };

    const finishIfDone = () => {
      if (done !== total) return;
      if (progressTimer) clearInterval(progressTimer);
      if (checkpointTimer) clearInterval(checkpointTimer);
      if (rampTimer) clearInterval(rampTimer);
      if (process.stdout.isTTY) {
        if (LOG_MODE === 'progress') {
          renderProgress(true);
          console.log('');
        }
      } else {
        if (LOG_MODE === 'progress') {
          renderProgress(true);
        }
      }
      if (LOG_MODE !== 'progress') {
        logCheckpoint();
      }
      if (logStream) {
        logStream.end();
      }
      resolve(results);
    };

    const runItem = async (item, { demote }) => {
      let demoteTimer = null;
      let controller = null;
      const itemKey = `${item.index}:${item.domain}`;

      if (demote && FAST_TIMEOUT_MS > 0) {
        controller = new AbortController();
        demoteTimer = setTimeout(() => {
          if (fastQueue.length > 0) {
            controller.abort('SLOW_DEMOTE');
          }
        }, FAST_TIMEOUT_MS);
      }

      try {
        if (!startedSet.has(itemKey)) {
          startedSet.add(itemKey);
          started++;
          if (LOG_MODE === 'progress') {
            renderProgress();
          } else if (LOG_MODE === 'stream') {
            writeLog('START', { domain: item.domain, details: 'checking' });
          }
        }
        const result = await checkDomainWithRetry(
          item.domain,
          demote
            ? { abortSignal: controller?.signal, retries: 0 }
            : { retries: RETRY_ATTEMPTS }
        );

        if (result?.error === 'SLOW_DEMOTE' && fastQueue.length > 0) {
          writeLog('DEMOTE', { domain: item.domain, details: `fast-timeout=${FAST_TIMEOUT_MS}ms` });
          slowQueue.push(item);
          return { demoted: true };
        }

        results[item.index] = result;
        if (result.status === 'online') {
          online++;
          if (Number.isFinite(result.responseTime)) onlineResponseSum += result.responseTime;
          if (LOG_MODE === 'stream') {
            const redirectCount = Array.isArray(result.redirects) ? result.redirects.length : 0;
            const details = [
              `code=${result.httpCode}`,
              `rt=${Math.round(result.responseTime)}ms`,
              redirectCount > 0 ? `redir=${redirectCount}` : null
            ].filter(Boolean).join(' ');
            writeLog('ONLINE', { domain: item.domain, details, httpCode: result.httpCode, responseTime: result.responseTime, redirects: redirectCount });
          }
        } else {
          offline++;
          if (result.error === 'TIMEOUT' || result.error === 'ETIMEDOUT') {
            timeoutCount++;
            timeoutErrors++;
          } else if (DNS_ERRORS.includes(result.error)) {
            dnsErrors++;
          } else if (result.error === 'ECONNRESET') {
            resetErrors++;
          } else {
            otherErrors++;
          }
          if (LOG_MODE === 'stream' || LOG_MODE === 'fail') {
            const details = `err=${result.error || 'UNKNOWN'}`;
            writeLog('OFFLINE', { domain: item.domain, details, error: result.error || 'UNKNOWN' });
          }
        }
        done++;
        if (LOG_MODE === 'progress') {
          renderProgress();
        }
        return { demoted: false };
      } catch (err) {
        const error = err?.code || err?.message || 'UNKNOWN';
        results[item.index] = {
          domain: item.domain,
          status: 'offline',
          httpCode: null,
          responseTime: null,
          ssl: null,
          headers: null,
          redirects: null,
          finalUrl: null,
          error,
          checkedAt: new Date(),
        };
        offline++;
        if (error === 'TIMEOUT' || error === 'ETIMEDOUT') {
          timeoutCount++;
          timeoutErrors++;
        } else if (DNS_ERRORS.includes(error)) {
          dnsErrors++;
        } else if (error === 'ECONNRESET') {
          resetErrors++;
        } else {
          otherErrors++;
        }
        if (LOG_MODE === 'stream' || LOG_MODE === 'fail') {
          writeLog('OFFLINE', { domain: item.domain, details: `err=${error}`, error });
        }
        done++;
        if (LOG_MODE === 'progress') {
          renderProgress();
        }
        return { demoted: false };
      } finally {
        if (demoteTimer) clearTimeout(demoteTimer);
      }
    };

    const pump = () => {
      while (inFlightFast < fastLaneLimit) {
        let item = null;
        let demote = false;

        if (fastQueue.length > 0) {
          item = fastQueue.shift();
          demote = true;
        } else if (slowQueue.length > 0) {
          item = slowQueue.shift();
        } else {
          break;
        }

        inFlightFast++;
        runItem(item, { demote })
          .finally(() => {
            inFlightFast--;
            pump();
            finishIfDone();
          });
      }

      while (inFlightSlow < slowLaneLimit) {
        let item = null;

        if (slowQueue.length > 0) {
          item = slowQueue.shift();
        } else if (fastQueue.length > 0) {
          item = fastQueue.shift();
        } else {
          break;
        }

        inFlightSlow++;
        runItem(item, { demote: false })
          .finally(() => {
            inFlightSlow--;
            pump();
            finishIfDone();
          });
      }
    };

    const rampEnabled = maxSlowLaneLimit > minSlowLaneLimit;
    let rampTimer = null;
    if (rampEnabled) {
      rampTimer = setInterval(() => {
        const doneDelta = done - lastDoneForRamp;
        const timeoutDelta = timeoutCount - lastTimeoutForRamp;
        lastDoneForRamp = done;
        lastTimeoutForRamp = timeoutCount;

        if (doneDelta < SLOW_RAMP_MIN_COMPLETIONS) return;

        const timeoutPct = timeoutDelta / doneDelta;
        const queued = fastQueue.length + slowQueue.length;
        const inFlight = inFlightFast + inFlightSlow;
        const atCapacity = inFlight >= fastLaneLimit + slowLaneLimit;

        if (!atCapacity || queued < SLOW_RAMP_QUEUE_THRESHOLD) return;

        if (timeoutPct > SLOW_RAMP_MAX_TIMEOUT_PCT && slowLaneLimit > minSlowLaneLimit) {
          const nextLimit = Math.max(minSlowLaneLimit, slowLaneLimit - SLOW_RAMP_STEP);
          if (nextLimit !== slowLaneLimit) {
            slowLaneLimit = nextLimit;
            logRamp(`Ramp: reducing slow lanes to ${slowLaneLimit} (timeouts ${(timeoutPct * 100).toFixed(1)}%)`);
            if (LOG_MODE === 'progress') {
              renderProgress(true);
            }
          }
          return;
        }

        if (timeoutPct <= SLOW_RAMP_MAX_TIMEOUT_PCT && slowLaneLimit < maxSlowLaneLimit) {
          const nextLimit = Math.min(maxSlowLaneLimit, slowLaneLimit + SLOW_RAMP_STEP);
          if (nextLimit !== slowLaneLimit) {
            slowLaneLimit = nextLimit;
            logRamp(`Ramp: increasing slow lanes to ${slowLaneLimit} (timeouts ${(timeoutPct * 100).toFixed(1)}%)`);
            pump();
            if (LOG_MODE === 'progress') {
              renderProgress(true);
            }
          }
        }
      }, SLOW_RAMP_INTERVAL_MS);
    }

    pump();
    finishIfDone();
  });
}

async function processSubsetWithConcurrency(items, concurrency, options) {
  const total = items.length;
  if (total === 0) return [];
  const results = new Array(total);
  let cursor = 0;
  let inFlight = 0;
  let done = 0;
  let recovered = 0;
  let stillOffline = 0;
  const startTime = Date.now();
  let spinIndex = 0;
  const spinChars = ['|', '/', '-', '\\'];
  let lastPct = 0;

  const renderProgress = (force = false) => {
    if (LOG_MODE !== 'progress') return;
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    const now = Date.now();
    const elapsed = now - startTime;
    const rate = done > 0 ? elapsed / done : 0;
    const etaMs = done > 0 ? rate * (total - done) : 0;
    const eta = done > 0 ? formatDuration(etaMs) : '--';
    const spinner = spinChars[spinIndex % spinChars.length];
    spinIndex++;

    const queued = total - cursor;
    const waiting = queued + inFlight;

    if (process.stdout.isTTY) {
      process.stdout.write(
        `\r[${spinner}] Second pass Active ${inFlight} Waiting ${waiting} Total ${total} | Started ${cursor} Completed ${done} | ETA ${eta} RT ${formatDuration(elapsed)} ONLINE ${recovered} OFFLINE ${stillOffline}    `
      );
    } else if (force || pct >= lastPct + 5 || done === total) {
      console.log(`[${spinner}] Second pass Active ${inFlight} Waiting ${waiting} Total ${total} | Started ${cursor} Completed ${done} | ETA ${eta} RT ${formatDuration(elapsed)} ONLINE ${recovered} OFFLINE ${stillOffline}`);
      lastPct = pct;
    }
  };

  let progressTimer = null;
  if (LOG_MODE === 'progress' && process.stdout.isTTY) {
    progressTimer = setInterval(() => renderProgress(false), DISPLAY_INTERVAL_MS);
  }

  return new Promise((resolve) => {
    const pump = () => {
      while (inFlight < concurrency && cursor < total) {
        const item = items[cursor];
        const currentIndex = cursor;
        cursor++;
        inFlight++;
        checkDomainWithRetry(item.domain, options)
          .then((result) => {
            results[currentIndex] = { index: item.index, result };
          })
          .finally(() => {
            inFlight--;
            done++;
            if (results[currentIndex]?.result?.status === 'online') {
              recovered++;
            } else {
              stillOffline++;
            }
            if (LOG_MODE === 'progress') {
              renderProgress();
            }
            if (done >= total) {
              if (progressTimer) clearInterval(progressTimer);
              if (process.stdout.isTTY && LOG_MODE === 'progress') {
                renderProgress(true);
                console.log('');
              } else if (LOG_MODE === 'progress') {
                renderProgress(true);
              }
              resolve(results.filter(Boolean));
              return;
            }
            pump();
          });
      }
    };
    pump();
  });
}

// Save to MongoDB with retry (only if MONGO_URI is defined)
async function saveToMongoDB(results, summary, checkDuration, maxRetries = 3) {
  if (!MONGO_ENABLED) {
    console.log('\nMongoDB: Skipped (MONGO_URI not defined)');
    return;
  }

  // Dynamic import - only load mongodb when needed
  const { MongoClient } = require('mongodb');

  let client;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\nConnecting to MongoDB (attempt ${attempt}/${maxRetries}): ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
      client = new MongoClient(MONGO_URI, {
        connectTimeoutMS: 30000,
        serverSelectionTimeoutMS: 30000
      });
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
        finalUrl: r.finalUrl,
        reachability: r.reachability || null
      }));

      // Bulk insert domain records
      await domainsCollection.insertMany(domainRecords);

      console.log(`${C.green}Saved to MongoDB:${C.reset} 1 check + ${results.length} domain records`);

      // Get total count
      const totalChecks = await checksCollection.countDocuments();
      const totalDomainRecords = await domainsCollection.countDocuments();
      console.log(`${C.dim}Total in DB: ${totalChecks} checks, ${totalDomainRecords} domain records${C.reset}`);

      // Success - exit the retry loop
      return;

    } catch (err) {
      lastError = err;
      console.error(`${C.red}MongoDB Error (attempt ${attempt}):${C.reset} ${err.message}`);

      if (attempt < maxRetries) {
        const waitTime = attempt * 10; // 10s, 20s, 30s
        console.log(`${C.yellow}Retrying in ${waitTime}s...${C.reset}`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }
    } finally {
      if (client) {
        try { await client.close(); } catch (e) {}
      }
    }
  }

  // All retries failed
  console.error(`${C.red}MongoDB Error:${C.reset} All ${maxRetries} attempts failed`);
  console.log(`${C.yellow}Continuing without MongoDB...${C.reset}`);
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
  const rampEnabled = MAX_CONCURRENCY > CONCURRENCY;
  const rampText = rampEnabled
    ? ` (max ${MAX_CONCURRENCY}, slow ramp +${SLOW_RAMP_STEP}/${SLOW_RAMP_INTERVAL_MS}ms)`
    : ' (slow ramp disabled: set MAX_CONCURRENCY > CONCURRENCY)';
  console.log(`Request timeout: ${TIMEOUT_MS}ms, Fast-demote: ${FAST_TIMEOUT_MS}ms, Concurrency: ${CONCURRENCY}${rampText}\n`);
  const behaviorText = [
    FORCE_IPV4 ? 'IPv4 only' : 'IPv4/IPv6 auto',
    SKIP_DNS_RETRIES ? 'DNS retries off' : 'DNS retries on'
  ].join(', ');
  console.log(`Behavior: ${behaviorText}`);
  const reachabilityText = REACHABILITY_ENABLED
    ? `Reachability: on (DNS ${DNS_TIMEOUT_MS}ms, TCP ${TCP_TIMEOUT_MS}ms, ports ${TCP_PORTS.join(',')})`
    : 'Reachability: off';
  console.log(reachabilityText);
  const secondPassText = SECOND_PASS_ENABLED
    ? `Second pass: on (timeout ${SECOND_PASS_TIMEOUT_MS}ms, DNS ${SECOND_PASS_DNS_TIMEOUT_MS}ms, TCP ${SECOND_PASS_TCP_TIMEOUT_MS}ms, concurrency ${SECOND_PASS_CONCURRENCY})`
    : 'Second pass: off';
  console.log(secondPassText);
  const logDetails = LOG_FILE ? `, file ${LOG_FILE}` : '';
  console.log(`Log mode: ${LOG_MODE}${logDetails}\n`);
  if (LOG_MODE !== 'progress') {
    console.log(
      `Legend: AVG=average response time (online only) | ` +
      `FAILS TIMEOUT=TIMEOUT/ETIMEDOUT | DNS=EAI_AGAIN/ENOTFOUND | RESET=ECONNRESET | OTHER=all other errors\n`
    );
  }

  const startTime = Date.now();
  let results = await processWithConcurrency(domains, CONCURRENCY);
  let secondPassStats = null;

  if (SECOND_PASS_ENABLED) {
    const offlineEntries = results
      .map((r, index) => ({ index, domain: r.domain, status: r.status }))
      .filter(r => r.status === 'offline');

    if (offlineEntries.length > 0) {
      console.log('\n=== Second Pass ===\n');
      console.log(`Config: timeout ${SECOND_PASS_TIMEOUT_MS}ms, DNS ${SECOND_PASS_DNS_TIMEOUT_MS}ms, TCP ${SECOND_PASS_TCP_TIMEOUT_MS}ms, concurrency ${SECOND_PASS_CONCURRENCY}, retries ${SECOND_PASS_RETRY_ATTEMPTS}`);
      console.log(`Rechecking ${offlineEntries.length} offline domains...`);
      const secondStart = Date.now();
      const secondResults = await processSubsetWithConcurrency(
        offlineEntries,
        SECOND_PASS_CONCURRENCY,
        {
          retries: SECOND_PASS_RETRY_ATTEMPTS,
          timeoutMs: SECOND_PASS_TIMEOUT_MS,
          reachabilityOverrides: {
            dnsTimeoutMs: SECOND_PASS_DNS_TIMEOUT_MS,
            tcpTimeoutMs: SECOND_PASS_TCP_TIMEOUT_MS,
            tcpPorts: TCP_PORTS,
          }
        }
      );

      let recovered = 0;
      secondResults.forEach(({ index, result }) => {
        if (results[index].status === 'offline' && result.status === 'online') {
          recovered++;
        }
        results[index] = result;
      });

      const durationSec = (Date.now() - secondStart) / 1000;
      const stillOffline = offlineEntries.length - recovered;
      secondPassStats = {
        total: offlineEntries.length,
        recovered,
        stillOffline,
        durationSec,
      };
      console.log(`Second pass done: recovered ${recovered}, still offline ${stillOffline}, time ${formatDuration(durationSec * 1000)}\n`);
    }
  }

  const elapsedSec = (Date.now() - startTime) / 1000;
  const elapsed = elapsedSec.toFixed(1);

  // Stats
  const online = results.filter(r => r.status === 'online');
  const offline = results.filter(r => r.status === 'offline');
  const withSSL = online.filter(r => r.ssl?.enabled === true);
  const validSSL = online.filter(r => r.ssl?.valid === true);
  const invalidSSL = withSSL.filter(r => r.ssl?.valid === false);
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

  const responseTimes = online
    .map(r => r.responseTime)
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  const p50 = percentile(responseTimes, 0.50);
  const p90 = percentile(responseTimes, 0.90);
  const p95 = percentile(responseTimes, 0.95);
  const avgResponseText = online.length > 0 ? formatMs(avgResponse) : '-';
  const p50Text = p50 !== null ? formatMs(p50) : '-';
  const p90Text = p90 !== null ? formatMs(p90) : '-';
  const p95Text = p95 !== null ? formatMs(p95) : '-';

  const slowestDomains = online
    .filter(r => Number.isFinite(r.responseTime))
    .sort((a, b) => b.responseTime - a.responseTime)
    .slice(0, 10);

  const httpCodes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, error: 0 };
  results.forEach((r) => {
    const code = r.httpCode;
    if (typeof code !== 'number' || code <= 0) {
      httpCodes.error++;
      return;
    }
    if (code >= 200 && code < 300) httpCodes['2xx']++;
    else if (code >= 300 && code < 400) httpCodes['3xx']++;
    else if (code >= 400 && code < 500) httpCodes['4xx']++;
    else if (code >= 500 && code < 600) httpCodes['5xx']++;
    else httpCodes.error++;
  });

  const errorBreakdown = { timeout: 0, dns: 0, reset: 0, refused: 0, other: 0 };
  offline.forEach((r) => {
    const err = r.error || 'UNKNOWN';
    if (err === 'TIMEOUT' || err === 'ETIMEDOUT') errorBreakdown.timeout++;
    else if (DNS_ERRORS.includes(err)) errorBreakdown.dns++;
    else if (err === 'ECONNRESET') errorBreakdown.reset++;
    else if (err === 'ECONNREFUSED') errorBreakdown.refused++;
    else errorBreakdown.other++;
  });

  const redirectsWith = results.filter(r => Array.isArray(r.redirects) && r.redirects.length > 0);
  const redirectsOnline = redirectsWith.filter(r => r.status === 'online');
  const redirectTotal = redirectsWith.reduce((sum, r) => sum + r.redirects.length, 0);
  const redirectAvg = redirectsWith.length > 0 ? (redirectTotal / redirectsWith.length).toFixed(1) : '0.0';
  const redirectMax = redirectsWith.length > 0 ? Math.max(...redirectsWith.map(r => r.redirects.length)) : 0;

  const selfSigned = online.filter(r => r.ssl?.selfSigned === true).length;
  const expiringSoon = online.filter(r =>
    Number.isFinite(r.ssl?.daysUntilExpiry) &&
    r.ssl.daysUntilExpiry >= 0 &&
    r.ssl.daysUntilExpiry <= 30
  ).length;

  const reachabilityResults = results.filter(r => r.reachability && r.reachability.dns);
  const reachabilityCollected = reachabilityResults.length > 0;
  const dnsOk = reachabilityResults.filter(r => r.reachability?.dns?.ok === true).length;
  const dnsFail = reachabilityResults.filter(r => r.reachability?.dns?.ok === false).length;
  const tcpOk = reachabilityResults.filter(r => r.reachability?.tcp?.ok === true).length;
  const tcpFail = reachabilityResults.filter(r => r.reachability?.tcp?.ok === false).length;
  const reachableButHttpFailed = results.filter(r =>
    r.status === 'offline' &&
    r.reachability?.dns?.ok === true &&
    r.reachability?.tcp?.ok === true
  ).length;
  const timeoutReachable = results.filter(r =>
    r.status === 'offline' &&
    (r.error === 'TIMEOUT' || r.error === 'ETIMEDOUT') &&
    r.reachability?.dns?.ok === true &&
    r.reachability?.tcp?.ok === true
  ).length;

  const throughput = elapsedSec > 0 ? (domains.length / elapsedSec) : 0;

  // Summary
  console.log('\n=== Summary ===\n');
  console.log('Totals:');
  console.log(`  Domains: ${domains.length}`);
  console.log(`  ${C.green}Online:${C.reset}  ${online.length} (${Math.round((online.length / domains.length) * 100)}%)`);
  console.log(`  ${C.red}Offline:${C.reset} ${offline.length} (${Math.round((offline.length / domains.length) * 100)}%)`);
  console.log(`  ${C.yellow}With SSL:${C.reset}  ${withSSL.length}`);
  console.log(`  ${C.yellow}Valid SSL:${C.reset} ${validSSL.length}`);

  console.log('\nPerformance:');
  console.log(`  Run time: ${formatDuration(elapsedSec * 1000)} (${elapsed}s)`);
  console.log(`  Throughput: ${throughput.toFixed(2)} domains/s (${(throughput * 60).toFixed(1)}/min)`);
  console.log(`  Response (online): avg ${avgResponseText} | p50 ${p50Text} | p90 ${p90Text} | p95 ${p95Text}`);
  if (secondPassStats) {
    console.log(`  Second pass: rechecked ${secondPassStats.total} | recovered ${secondPassStats.recovered} | still offline ${secondPassStats.stillOffline} | time ${formatDuration(secondPassStats.durationSec * 1000)}`);
  }

  console.log('\nHTTP codes:');
  console.log(`  2xx ${httpCodes['2xx']} | 3xx ${httpCodes['3xx']} | 4xx ${httpCodes['4xx']} | 5xx ${httpCodes['5xx']} | error/offline ${httpCodes.error}`);

  console.log('\nErrors (offline):');
  console.log(`  timeout ${errorBreakdown.timeout} | dns ${errorBreakdown.dns} | reset ${errorBreakdown.reset} | refused ${errorBreakdown.refused} | other ${errorBreakdown.other}`);

  console.log('\nRedirects:');
  console.log(`  With redirects: ${redirectsWith.length} (${Math.round((redirectsWith.length / domains.length) * 100)}% of all, ${Math.round((redirectsOnline.length / Math.max(1, online.length)) * 100)}% of online) | avg chain ${redirectAvg} | max chain ${redirectMax}`);

  console.log('\nSSL:');
  console.log(`  Valid ${validSSL.length} | Invalid ${invalidSSL.length} | Self-signed ${selfSigned} | Expiring <=30d ${expiringSoon}`);

  if (reachabilityCollected) {
    console.log('\nReachability:');
    console.log(`  DNS ok ${dnsOk} | DNS fail ${dnsFail}`);
    console.log(`  TCP ok ${tcpOk} | TCP fail ${tcpFail}`);
    console.log(`  Reachable but HTTP failed ${reachableButHttpFailed}`);
    console.log(`  HTTP timeout with TCP ok ${timeoutReachable}`);
  } else {
    console.log('\nReachability: not collected');
  }

  if (slowestDomains.length > 0) {
    console.log('\nSlowest domains:');
    slowestDomains.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.domain} (${formatMs(d.responseTime)})`);
    });
  }

  console.log(`\n  Output: ${OUTPUT_FILE}\n`);
}

main().catch(console.error);
