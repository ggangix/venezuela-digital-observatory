/**
 * Preserve active government sites in the Internet Archive (Save Page Now).
 *
 * After each valid check, up to ARCHIVE_MAX_PER_RUN active sites that have not been
 * archived in ARCHIVE_INTERVAL_DAYS are submitted, ARCHIVE_DELAY_MS apart.
 * Never-archived sites go first, then the ones archived longest ago.
 *
 * With IA_ACCESS_KEY / IA_SECRET_KEY (https://archive.org/account/s3.php) it uses the
 * authenticated SPN2 API, which has higher limits; otherwise the anonymous endpoint.
 * Set ARCHIVE_ENABLED=false to turn it off.
 */

const https = require('https');

const ARCHIVE_ENABLED = (process.env.ARCHIVE_ENABLED || 'true').toLowerCase() === 'true';
const ARCHIVE_MAX_PER_RUN = Math.max(0, parseInt(process.env.ARCHIVE_MAX_PER_RUN || '20', 10));
const ARCHIVE_INTERVAL_DAYS = Math.max(1, parseInt(process.env.ARCHIVE_INTERVAL_DAYS || '7', 10));
const ARCHIVE_DELAY_MS = Math.max(0, parseInt(process.env.ARCHIVE_DELAY_MS || '20000', 10));
const ARCHIVE_TIMEOUT_MS = 90000;
const IA_ACCESS_KEY = process.env.IA_ACCESS_KEY || '';
const IA_SECRET_KEY = process.env.IA_SECRET_KEY || '';

function request(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.setTimeout(ARCHIVE_TIMEOUT_MS, () => req.destroy(new Error('TIMEOUT')));
    req.on('error', (err) => resolve({ status: null, error: err.code || err.message }));
    if (body) req.write(body);
    req.end();
  });
}

function submit(url) {
  const headers = { 'User-Agent': 'VenezuelaDigitalObservatory/1.0 (+https://venezueladigitalobservatory.com)' };
  if (IA_ACCESS_KEY && IA_SECRET_KEY) {
    const body = new URLSearchParams({ url, skip_first_archive: '1' }).toString();
    return request({
      method: 'POST',
      hostname: 'web.archive.org',
      path: '/save',
      headers: {
        ...headers,
        Accept: 'application/json',
        Authorization: `LOW ${IA_ACCESS_KEY}:${IA_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);
  }
  return request({ method: 'GET', hostname: 'web.archive.org', path: `/save/${url}`, headers });
}

async function archiveActiveSites(db) {
  if (!ARCHIVE_ENABLED || ARCHIVE_MAX_PER_RUN === 0) return { submitted: 0 };

  const state = db.collection('ve_monitor_state');
  const cutoff = new Date(Date.now() - ARCHIVE_INTERVAL_DAYS * 86400000);
  const candidates = await state
    .find({
      category: 'active',
      $or: [{ lastArchiveAttemptAt: null }, { lastArchiveAttemptAt: { $lt: cutoff } }],
    })
    .sort({ lastArchivedAt: 1, lastArchiveAttemptAt: 1 })
    .limit(ARCHIVE_MAX_PER_RUN)
    .project({ domain: 1, url: 1 })
    .toArray();

  if (candidates.length === 0) return { submitted: 0 };
  console.log(`\nInternet Archive: submitting ${candidates.length} sites (${IA_ACCESS_KEY ? 'SPN2' : 'anonymous'})`);

  let ok = 0;
  for (let i = 0; i < candidates.length; i++) {
    const { domain, url } = candidates[i];
    const target = url || `https://${domain}`;
    const result = await submit(target);
    const success = result.status >= 200 && result.status < 400;
    if (success) ok++;
    await state.updateOne({ domain }, {
      $set: {
        lastArchiveAttemptAt: new Date(),
        lastArchiveStatus: result.status || result.error,
        ...(success ? { lastArchivedAt: new Date() } : {}),
      },
    });
    console.log(`  ${success ? 'ok ' : 'err'} ${domain} (${result.status || result.error})`);

    // Back off for the rest of this run if the archive is rate limiting us
    if (result.status === 429) {
      console.log('  rate limited by archive.org, stopping until next run');
      break;
    }
    if (i < candidates.length - 1) await new Promise(r => setTimeout(r, ARCHIVE_DELAY_MS));
  }

  console.log(`Internet Archive: ${ok}/${candidates.length} submitted`);
  return { submitted: ok };
}

module.exports = { archiveActiveSites };
