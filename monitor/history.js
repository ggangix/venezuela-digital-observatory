/**
 * Per-domain state and change events.
 *
 * Collections:
 *   ve_monitor_state   one document per domain: confirmed category and since when,
 *                      first/last time seen active, hosting, SSL, archive bookkeeping
 *   ve_monitor_events  one document per confirmed change (status, hosting, SSL, new domain)
 *
 * A status change is only confirmed after CONFIRM_CHECKS consecutive checks agree,
 * so a single flaky check does not produce "went down / came back" noise.
 * The event is dated at the first check that observed the new state.
 * Domains that keep changing (INTERMITTENT_MIN_CHANGES in INTERMITTENT_WINDOW_DAYS)
 * are flagged `intermittent`, and their events carry `intermittent: true` so the
 * feed can group them instead of listing every flip.
 */

const { categorize } = require('./classify');

const CONFIRM_CHECKS = Math.max(1, parseInt(process.env.CONFIRM_CHECKS || '4', 10)); // 4 checks = 24h
const INTERMITTENT_WINDOW_DAYS = 30;
const INTERMITTENT_MIN_CHANGES = 3;
const VALIDITY_WINDOW = 20;
const VALIDITY_MIN_RATIO = 0.5;
const SSL_RENEW_MIN_DAYS = 20;
const DAY_MS = 86400000;

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A check is discarded when the number of active sites collapses compared to the
 * recent median. That only happens when the monitor itself lost connectivity
 * (e.g. the VPN tunnel was down), not when the government sites changed.
 */
function assessValidity(active, recentActive, fallbackMedian = null) {
  if (active === 0) {
    return { valid: false, reason: 'no_active_sites' };
  }
  const med = recentActive.length >= 3 ? median(recentActive) : fallbackMedian;
  if (!med) return { valid: true };
  if (active < med * VALIDITY_MIN_RATIO) {
    return { valid: false, reason: `active ${active} < ${VALIDITY_MIN_RATIO * 100}% of recent median ${med}` };
  }
  return { valid: true };
}

async function recentActiveCounts(checks, before) {
  const filter = { valid: { $ne: false } };
  if (before) filter.checkedAt = { $lt: before };
  const recent = await checks
    .find(filter)
    .sort({ checkedAt: -1 })
    .limit(VALIDITY_WINDOW)
    .project({ summary: 1 })
    .toArray();
  return recent
    .map(c => c.summary?.active ?? c.summary?.online)
    .filter(n => Number.isFinite(n) && n > 0);
}

async function ensureIndexes(db) {
  await db.collection('ve_monitor_state').createIndex({ domain: 1 }, { unique: true });
  await db.collection('ve_monitor_state').createIndex({ category: 1 });
  await db.collection('ve_monitor_events').createIndex({ at: -1 });
  await db.collection('ve_monitor_events').createIndex({ domain: 1, at: -1 });
  await db.collection('ve_monitor_events').createIndex({ type: 1, at: -1 });
  await db.collection('ve_monitor_checks').createIndex({ valid: 1, checkedAt: -1 });
}

class HistoryTracker {
  constructor(db) {
    this.db = db;
    this.state = new Map();
    this.dirty = new Set();
    this.events = [];
  }

  async load() {
    const docs = await this.db.collection('ve_monitor_state').find({}).toArray();
    for (const doc of docs) {
      delete doc._id;
      this.state.set(doc.domain, doc);
    }
    return this.state.size;
  }

  get isEmpty() {
    return this.state.size === 0;
  }

  emit(type, domain, at, checkId, fields = {}) {
    this.events.push({ type, domain, at, detectedAt: at, checkId, ...fields });
  }

  /**
   * Apply one check. `baseline` = first check ever: set state without events.
   */
  applyCheck(checkId, checkedAt, records, { baseline = false } = {}) {
    for (const record of records) {
      this.applyRecord(record, checkId, record.checkedAt || checkedAt, baseline);
    }
  }

  applyRecord(record, checkId, at, baseline) {
    const domain = record.domain;
    const category = record.category || categorize(record);
    let s = this.state.get(domain);
    this.dirty.add(domain);

    if (!s) {
      s = {
        domain,
        category,
        since: at,
        pending: null,
        firstSeenAt: at,
        firstActiveAt: category === 'active' ? at : null,
        lastActiveAt: category === 'active' ? at : null,
        lastCheckedAt: at,
        checks: 1,
        activeChecks: category === 'active' ? 1 : 0,
        hosting: null,
        pendingHosting: null,
        ssl: null,
        url: null,
        recentChanges: [],
        intermittent: false,
      };
      this.state.set(domain, s);
      if (!baseline) this.emit('new_domain', domain, at, checkId, { to: category });
      this.applyDetails(s, record, checkId, at, true);
      return;
    }

    s.checks = (s.checks || 0) + 1;
    s.lastCheckedAt = at;
    if (category === 'active') {
      s.activeChecks = (s.activeChecks || 0) + 1;
      s.lastActiveAt = at;
      if (!s.firstActiveAt) s.firstActiveAt = at;
    }

    if (category === s.category) {
      s.pending = null;
    } else {
      if (s.pending && s.pending.category === category) {
        s.pending.count++;
      } else {
        s.pending = { category, since: at, count: 1 };
      }
      if (s.pending.count >= CONFIRM_CHECKS) {
        const windowStart = new Date(at.getTime() - INTERMITTENT_WINDOW_DAYS * DAY_MS);
        const recent = (s.recentChanges || []).filter(d => new Date(d) >= windowStart);
        this.emit('status', domain, s.pending.since, checkId, {
          from: s.category,
          to: category,
          detectedAt: at,
          previousSince: s.since,
          // The previous state was already there when monitoring started: its real start is unknown
          previousSinceIsStart: new Date(s.since).getTime() === new Date(s.firstSeenAt).getTime(),
          intermittent: recent.length >= INTERMITTENT_MIN_CHANGES - 1,
        });
        recent.push(s.pending.since);
        s.recentChanges = recent;
        s.category = category;
        s.since = s.pending.since;
        s.pending = null;
      }
    }

    const windowStart = new Date(at.getTime() - INTERMITTENT_WINDOW_DAYS * DAY_MS);
    s.recentChanges = (s.recentChanges || []).filter(d => new Date(d) >= windowStart);
    s.intermittent = s.recentChanges.length >= INTERMITTENT_MIN_CHANGES;

    this.applyDetails(s, record, checkId, at, false);
  }

  applyDetails(s, record, checkId, at, isNew) {
    if (record.status === 'online') {
      s.url = record.finalUrl || `${record.ssl?.enabled ? 'https' : 'http'}://${record.domain}`;
    }

    // Hosting network (ASN), confirmed like status changes
    const h = record.hosting;
    if (h && Number.isFinite(h.asn)) {
      const next = { asn: h.asn, asName: h.asName || null, country: h.country || null, ip: h.ip || null };
      if (!s.hosting || isNew) {
        s.hosting = next;
        s.pendingHosting = null;
      } else if (s.hosting.asn === next.asn) {
        s.hosting = next;
        s.pendingHosting = null;
      } else {
        if (s.pendingHosting && s.pendingHosting.asn === next.asn) {
          s.pendingHosting.count++;
        } else {
          s.pendingHosting = { ...next, since: at, count: 1 };
        }
        if (s.pendingHosting.count >= CONFIRM_CHECKS) {
          this.emit('hosting_change', s.domain, s.pendingHosting.since, checkId, {
            from: { asn: s.hosting.asn, asName: s.hosting.asName, country: s.hosting.country },
            to: { asn: next.asn, asName: next.asName, country: next.country },
            detectedAt: at,
          });
          s.hosting = next;
          s.pendingHosting = null;
        }
      }
    }

    // SSL: renewals and expirations, only for sites that answered
    const ssl = record.ssl;
    if (record.status === 'online' && ssl?.enabled && ssl.validTo) {
      const validTo = new Date(ssl.validTo);
      if (!Number.isNaN(validTo.getTime())) {
        const prevMax = s.ssl?.maxValidTo ? new Date(s.ssl.maxValidTo) : null;
        if (!isNew && prevMax && validTo - prevMax > SSL_RENEW_MIN_DAYS * DAY_MS) {
          this.emit('ssl_renewed', s.domain, at, checkId, {
            details: { issuer: ssl.issuer || null, validTo, previousValidTo: prevMax },
          });
        }
        const maxValidTo = !prevMax || validTo > prevMax ? validTo : prevMax;
        const expired = typeof ssl.daysUntilExpiry === 'number' && ssl.daysUntilExpiry <= 0;
        const expiredKey = expired ? validTo.toISOString() : null;
        if (!isNew && expired && s.ssl?.expiredFor !== expiredKey) {
          this.emit('ssl_expired', s.domain, at, checkId, {
            details: { issuer: ssl.issuer || null, validTo },
          });
        }
        s.ssl = {
          issuer: ssl.issuer || null,
          validTo,
          maxValidTo,
          valid: ssl.valid === true,
          expiredFor: expired ? expiredKey : (s.ssl?.expiredFor || null),
        };
      }
    }
  }

  async flush() {
    const stateCol = this.db.collection('ve_monitor_state');
    const ops = [];
    for (const domain of this.dirty) {
      const doc = this.state.get(domain);
      // Archive fields are owned by archive.js; never overwrite them here
      const { lastArchivedAt, lastArchiveAttemptAt, lastArchiveStatus, ...rest } = doc;
      ops.push({ updateOne: { filter: { domain }, update: { $set: rest }, upsert: true } });
    }
    for (let i = 0; i < ops.length; i += 1000) {
      await stateCol.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    }
    const events = this.events;
    for (let i = 0; i < events.length; i += 1000) {
      await this.db.collection('ve_monitor_events').insertMany(events.slice(i, i + 1000), { ordered: false });
    }
    const written = { states: ops.length, events: events.length };
    this.dirty.clear();
    this.events = [];
    return written;
  }
}

module.exports = {
  HistoryTracker,
  assessValidity,
  recentActiveCounts,
  ensureIndexes,
  median,
  CONFIRM_CHECKS,
};
