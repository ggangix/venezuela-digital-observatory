#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fingerprint pass: downloads the homepage of each active site and stores what
 * it is made of (CMS, trackers, obsolete tech) plus defacement signals.
 *
 * Runs as its own process after the status check (entrypoint.sh), in the
 * background, so the extra download never delays the next check. It reuses the
 * VPN because it shares the monitor container's network.
 *
 * Storage follows the hosting pattern: the fingerprint lives on the per-domain
 * state document (overwritten each pass), and only a confirmed defacement or a
 * CMS change produces an event — with the evidence that triggered it (idea #5).
 *
 * Disable with FINGERPRINT_ENABLED=false.
 */

const https = require('https');
const http = require('http');
const { MongoClient } = require('mongodb');
const { extract } = require('./fingerprint-extract');

const ENABLED = (process.env.FINGERPRINT_ENABLED || 'true').toLowerCase() === 'true';
const CONCURRENCY = Math.max(1, parseInt(process.env.FINGERPRINT_CONCURRENCY || '12', 10));
const MAX_BYTES = Math.max(1, parseInt(process.env.FINGERPRINT_MAX_BYTES || '160000', 10));
const TIMEOUT_MS = Math.max(1000, parseInt(process.env.FINGERPRINT_TIMEOUT_MS || '15000', 10));
const CONFIRM = Math.max(1, parseInt(process.env.FINGERPRINT_CONFIRM || '2', 10)); // passes before a flag becomes an event
const USER_AGENT = 'Mozilla/5.0 (compatible; VenezuelaDigitalObservatory/1.0)';

function once(u) {
  return new Promise((res) => {
    let url;
    try { url = new URL(u); } catch { return res(null); }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      u,
      { rejectUnauthorized: false, headers: { 'User-Agent': USER_AGENT }, timeout: TIMEOUT_MS },
      (rr) => {
        let d = '';
        rr.on('data', (c) => { d += c; if (d.length > MAX_BYTES) req.destroy(); });
        rr.on('end', () => res({ code: rr.statusCode, loc: rr.headers.location, html: d }));
      }
    );
    req.on('error', () => res(null));
    req.on('timeout', () => { req.destroy(); res(null); });
  });
}

async function fetchHome(domain) {
  let u = `https://${domain}`;
  let final = u;
  for (let i = 0; i < 4; i++) {
    const r = await Promise.race([once(u), new Promise((x) => setTimeout(() => x(null), TIMEOUT_MS + 2000))]);
    if (!r) {
      if (u.startsWith('https://')) { u = `http://${domain}`; final = u; continue; } // one HTTP fallback
      return null;
    }
    if ([301, 302, 303, 307, 308].includes(r.code) && r.loc) {
      try { u = new URL(r.loc, u).href; } catch { return null; }
      final = u;
      continue;
    }
    return { html: r.html, finalUrl: final };
  }
  return null;
}

// Compact signal arrays to id lists for storage/diffing
const ids = (arr) => (arr || []).map((x) => x.id).sort();
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function run() {
  if (!ENABLED) return;
  const uri = process.env.MONGO_URI;
  if (!uri) { console.log('Fingerprint: MONGO_URI not set, skipping'); return; }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const checks = db.collection('ve_monitor_checks');
    const domainsCol = db.collection('ve_monitor_domains');
    const state = db.collection('ve_monitor_state');
    const events = db.collection('ve_monitor_events');
    await events.createIndex({ type: 1, at: -1 }).catch(() => {});

    const latest = await checks.findOne({ valid: { $ne: false } }, { sort: { checkedAt: -1 } });
    if (!latest) { console.log('Fingerprint: no valid check'); return; }
    const active = await domainsCol
      .find({ checkId: latest._id, status: 'online' })
      .project({ _id: 0, domain: 1, finalUrl: 1 })
      .toArray();

    console.log(`\nFingerprint: ${active.length} active sites`);
    const startedAt = Date.now();
    let fetched = 0, flagged = 0, evented = 0;
    let idx = 0;

    const worker = async () => {
      while (idx < active.length) {
        const { domain } = active[idx++];
        const page = await fetchHome(domain);
        if (!page) continue;
        fetched++;

        const fp = extract({ domain, html: page.html, finalUrl: page.finalUrl });
        const flagIds = ids(fp.flags);
        if (flagIds.length) flagged++;

        const prev = await state.findOne({ domain }, { projection: { fingerprint: 1, flagPending: 1 } });
        const prevFp = prev?.fingerprint || {};

        // Confirm defacement flags over CONFIRM consecutive passes before emitting
        const pend = prev?.flagPending || { ids: [], count: 0 };
        let pending = sameSet(pend.ids, flagIds) ? { ids: flagIds, count: pend.count + 1 } : { ids: flagIds, count: 1 };
        const alreadyConfirmed = ids(prevFp.flags);
        if (flagIds.length && pending.count >= CONFIRM && !sameSet(alreadyConfirmed, flagIds)) {
          await events.insertOne({
            type: 'defacement_suspected',
            domain,
            at: new Date(),
            detectedAt: new Date(),
            checkId: null,
            flags: fp.flags, // each with evidence (idea #5)
            title: fp.title,
          });
          evented++;
          pending = { ids: flagIds, count: pending.count }; // keep, but confirmed now
        }

        // CMS change event (meaningful, rare)
        const prevCms = ids(prevFp.cms);
        const newCms = ids(fp.cms);
        if (prevFp.cms && !sameSet(prevCms, newCms) && newCms.length) {
          await events.insertOne({
            type: 'cms_change',
            domain, at: new Date(), detectedAt: new Date(), checkId: null,
            from: prevFp.cms, to: fp.cms,
          });
          evented++;
        }

        await state.updateOne(
          { domain },
          { $set: { fingerprint: fp, flagPending: pending, fingerprintAt: new Date() } },
          { upsert: true }
        );
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, active.length) }, worker));
    console.log(
      `Fingerprint: ${fetched}/${active.length} fetched, ${flagged} with flags, ${evented} events ` +
      `(${Math.round((Date.now() - startedAt) / 1000)}s)`
    );
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error('Fingerprint failed:', e.message); process.exit(1); });
}

module.exports = { run };
