#!/usr/bin/env node
/**
 * Preserve active government sites in the Internet Archive (Save Page Now).
 *
 * Every active site is submitted once per ARCHIVE_INTERVAL_HOURS (default: daily).
 * Order: never archived first, then sites whose status changed recently (just came
 * back, new), then the ones archived longest ago. Sites that are down are skipped:
 * the archive would only store an error page.
 *
 * With IA_ACCESS_KEY / IA_SECRET_KEY (https://archive.org/account/s3.php) it uses the
 * authenticated SPN2 API: it waits for a free capture slot before each submission and
 * asks the archive to skip sites already captured in the last ARCHIVE_SKIP_IF_WITHIN.
 * Without keys it falls back to the anonymous endpoint, slowly and in small batches.
 *
 * Runs as its own process (entrypoint.sh starts it in the background after each
 * check) so archiving never delays the next status check.
 * Set ARCHIVE_ENABLED=false to turn it off.
 */

const https = require('https');
const { MongoClient } = require('mongodb');

const IA_ACCESS_KEY = process.env.IA_ACCESS_KEY || '';
const IA_SECRET_KEY = process.env.IA_SECRET_KEY || '';
const AUTHENTICATED = !!(IA_ACCESS_KEY && IA_SECRET_KEY);

const ARCHIVE_ENABLED = (process.env.ARCHIVE_ENABLED || 'true').toLowerCase() === 'true';
const ARCHIVE_INTERVAL_HOURS = Math.max(1, parseInt(process.env.ARCHIVE_INTERVAL_HOURS || '24', 10));
const ARCHIVE_MAX_PER_RUN = Math.max(0, parseInt(process.env.ARCHIVE_MAX_PER_RUN || (AUTHENTICATED ? '1000' : '20'), 10));
const ARCHIVE_DELAY_MS = Math.max(0, parseInt(process.env.ARCHIVE_DELAY_MS || (AUTHENTICATED ? '15000' : '20000'), 10));
const RATE_LIMIT_WAIT_MS = 60000;
const MAX_CONSECUTIVE_RATE_LIMITS = 5;
const ARCHIVE_SKIP_IF_WITHIN = process.env.ARCHIVE_SKIP_IF_WITHIN || '20h';
const RECENT_CHANGE_HOURS = 48;
const SLOT_WAIT_MAX_MS = 5 * 60000;
const REQUEST_TIMEOUT_MS = 90000;
const USER_AGENT = 'VenezuelaDigitalObservatory/1.0 (+https://venezueladigitalobservatory.com)';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function request(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (data.length < 65536) data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('TIMEOUT')));
    req.on('error', (err) => resolve({ status: null, error: err.code || err.message }));
    if (body) req.write(body);
    req.end();
  });
}

function authHeaders() {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    Authorization: `LOW ${IA_ACCESS_KEY}:${IA_SECRET_KEY}`,
  };
}

// SPN2 allows a few captures in progress per account; wait for a free slot
async function waitForSlot() {
  const start = Date.now();
  while (Date.now() - start < SLOT_WAIT_MAX_MS) {
    const res = await request({ method: 'GET', hostname: 'web.archive.org', path: '/save/status/user', headers: authHeaders() });
    try {
      const status = JSON.parse(res.body);
      if (status.available > 0) return status;
    } catch (e) {
      // Unexpected answer: do not block the run on it
      return null;
    }
    await sleep(10000);
  }
  return null;
}

async function submit(url) {
  if (AUTHENTICATED) {
    const body = new URLSearchParams({
      url,
      skip_first_archive: '1',
      if_not_archived_within: ARCHIVE_SKIP_IF_WITHIN,
    }).toString();
    const res = await request({
      method: 'POST',
      hostname: 'web.archive.org',
      path: '/save',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);
    // SPN2 answers 200 with either a job_id or a message (e.g. already archived recently)
    let json = null;
    try { json = JSON.parse(res.body); } catch (e) { /* not JSON */ }
    if (res.status === 200 && json?.job_id) return { ok: true, status: 'submitted' };
    if (res.status === 200 && /within|recent/i.test(json?.message || '')) return { ok: true, status: 'recent' };
    return { ok: false, status: res.status || res.error, message: json?.message || json?.status_ext || null };
  }

  const res = await request({ method: 'GET', hostname: 'web.archive.org', path: `/save/${url}`, headers: { 'User-Agent': USER_AGENT } });
  const ok = res.status >= 200 && res.status < 400;
  return { ok, status: res.status || res.error };
}

async function archiveActiveSites(db) {
  if (!ARCHIVE_ENABLED || ARCHIVE_MAX_PER_RUN === 0) return { submitted: 0 };

  const state = db.collection('ve_monitor_state');
  const now = Date.now();
  const cutoff = new Date(now - ARCHIVE_INTERVAL_HOURS * 3600000);
  const recentChange = new Date(now - RECENT_CHANGE_HOURS * 3600000);

  const due = await state
    .find({
      category: 'active',
      $or: [{ lastArchiveAttemptAt: null }, { lastArchiveAttemptAt: { $lt: cutoff } }],
    })
    .project({ domain: 1, url: 1, since: 1, lastArchivedAt: 1 })
    .toArray();

  const priority = (s) => {
    if (!s.lastArchivedAt) return 0;
    if (s.since && new Date(s.since) >= recentChange) return 1;
    return 2;
  };
  const candidates = due
    .sort((a, b) => priority(a) - priority(b) || new Date(a.lastArchivedAt || 0) - new Date(b.lastArchivedAt || 0))
    .slice(0, ARCHIVE_MAX_PER_RUN);

  if (candidates.length === 0) {
    console.log('Internet Archive: nothing due');
    return { submitted: 0 };
  }
  console.log(`Internet Archive: ${candidates.length} of ${due.length} due sites (${AUTHENTICATED ? 'SPN2' : 'anonymous'})`);

  let ok = 0;
  let failed = 0;
  let consecutiveRateLimits = 0;
  for (let i = 0; i < candidates.length; i++) {
    const { domain, url } = candidates[i];
    if (AUTHENTICATED) await waitForSlot();

    const result = await submit(url || `https://${domain}`);

    // 429 = too many captures in progress: wait and retry the same site.
    // Only give up for this run if the archive keeps refusing.
    if (result.status === 429) {
      consecutiveRateLimits++;
      if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
        console.log(`  rate limited by archive.org ${consecutiveRateLimits} times in a row, stopping until next run`);
        break;
      }
      await sleep(RATE_LIMIT_WAIT_MS);
      i--;
      continue;
    }
    consecutiveRateLimits = 0;

    if (result.ok) ok++;
    else failed++;
    await state.updateOne({ domain }, {
      $set: {
        lastArchiveAttemptAt: new Date(),
        lastArchiveStatus: result.status,
        ...(result.ok ? { lastArchivedAt: new Date() } : {}),
      },
    });
    if (!result.ok) console.log(`  err ${domain} (${result.status}${result.message ? `: ${result.message}` : ''})`);
    if (i < candidates.length - 1) await sleep(ARCHIVE_DELAY_MS);
  }

  console.log(`Internet Archive: ${ok} submitted, ${failed} failed`);
  return { submitted: ok, failed };
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.log('Internet Archive: MONGO_URI not set, skipping');
    return;
  }
  const client = new MongoClient(uri);
  await client.connect();
  try {
    await archiveActiveSites(client.db());
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Internet Archive run failed:', err.message);
      process.exit(1);
    });
}

module.exports = { archiveActiveSites };
