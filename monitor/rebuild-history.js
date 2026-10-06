#!/usr/bin/env node
/**
 * Rebuild derived data from the full check history:
 *   - summary.active / failing / noDns on every check
 *   - valid / invalidReason on every check (monitor connectivity failures)
 *   - discarded: true on domain records of invalid checks
 *   - ve_monitor_state and ve_monitor_events, replayed check by check
 *
 * Runs automatically from entrypoint.sh when ve_monitor_state is empty,
 * or manually with: node rebuild-history.js --force
 */

const { MongoClient } = require('mongodb');
const { categorize, countCategories } = require('./classify');
const { HistoryTracker, assessValidity, ensureIndexes, median } = require('./history');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ve_monitor';
const FORCE = process.argv.includes('--force') || process.env.REBUILD_HISTORY === 'true';

const RECORD_PROJECTION = {
  _id: 0,
  domain: 1,
  checkedAt: 1,
  status: 1,
  error: 1,
  category: 1,
  finalUrl: 1,
  hosting: 1,
  'reachability.dns.ok': 1,
  'ssl.enabled': 1,
  'ssl.valid': 1,
  'ssl.issuer': 1,
  'ssl.validTo': 1,
  'ssl.daysUntilExpiry': 1,
};

async function rebuild() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    const db = client.db();
    const checks = db.collection('ve_monitor_checks');
    const domains = db.collection('ve_monitor_domains');
    const stateCol = db.collection('ve_monitor_state');
    const eventsCol = db.collection('ve_monitor_events');

    const existing = await stateCol.countDocuments();
    if (existing > 0 && !FORCE) {
      console.log(`History already built (${existing} domain states). Use --force to rebuild.`);
      return;
    }

    console.log('Rebuilding history from all checks...');
    await stateCol.deleteMany({});
    await eventsCol.deleteMany({});
    await ensureIndexes(db);

    const tracker = new HistoryTracker(db);
    const allChecks = await checks.find({}).sort({ checkedAt: 1 }).project({ _id: 1, checkedAt: 1, summary: 1 }).toArray();
    // Active == online, so the overall median of summary.online is a safe reference
    // for the first checks, before there is enough recent history to compare with.
    const fallbackMedian = median(allChecks.map(c => c.summary?.online).filter(n => Number.isFinite(n) && n > 0));
    const recentActive = [];
    let baselineDone = false;
    let processed = 0;
    let invalid = 0;
    let withoutRecords = 0;
    const startedAt = Date.now();

    for (const check of allChecks) {
      const records = await domains.find({ checkId: check._id }).project(RECORD_PROJECTION).toArray();

      // Skip checks with no (or only partial) domain records
      const expected = check.summary?.totalDomains || 0;
      if (records.length === 0 || records.length < expected * 0.9) {
        withoutRecords++;
        continue;
      }

      const counts = countCategories(records);
      const verdict = assessValidity(counts.active, recentActive.slice(-20), fallbackMedian);

      const set = {
        'summary.active': counts.active,
        'summary.failing': counts.failing,
        'summary.noDns': counts.noDns,
        valid: verdict.valid,
      };
      const update = verdict.valid
        ? { $set: set, $unset: { invalidReason: '' } }
        : { $set: { ...set, invalidReason: verdict.reason } };
      await checks.updateOne({ _id: check._id }, update);

      if (!verdict.valid) {
        invalid++;
        await domains.updateMany({ checkId: check._id }, { $set: { discarded: true } });
        console.log(`  discarded ${check.checkedAt.toISOString()}: ${verdict.reason}`);
        continue;
      }

      recentActive.push(counts.active);
      tracker.applyCheck(check._id, check.checkedAt, records, { baseline: !baselineDone });
      baselineDone = true;
      processed++;

      if (tracker.events.length > 5000 || processed % 100 === 0) {
        await tracker.flush();
        console.log(`  ${processed}/${allChecks.length} checks (${Math.round((Date.now() - startedAt) / 1000)}s)`);
      }
    }

    const written = await tracker.flush();
    const totalEvents = await eventsCol.countDocuments();
    console.log(
      `Done in ${Math.round((Date.now() - startedAt) / 1000)}s: ${processed} valid checks, ${invalid} discarded, ` +
      `${withoutRecords} without records, ${tracker.state.size} domains, ${totalEvents} events ` +
      `(median active ${median(recentActive)})`
    );
    return written;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  rebuild()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Rebuild failed:', err.message);
      process.exit(1);
    });
}

module.exports = { rebuild, categorize };
