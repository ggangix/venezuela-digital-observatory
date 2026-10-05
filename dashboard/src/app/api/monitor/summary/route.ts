import { NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import {
  CATEGORY_EXPR,
  CHECK_INTERVAL_HOURS,
  VALID_CHECK_FILTER,
  getLatestValidCheck,
} from '@/lib/checks';

export const revalidate = 60; // Cache for 60 seconds

export async function GET() {
  try {
    const { checks, domains, events } = await getMonitorCollection();

    const latestCheck = await getLatestValidCheck(checks);

    if (!latestCheck) {
      return NextResponse.json(
        { error: 'No check data available' },
        { status: 404 }
      );
    }

    // Older checks have no category counts; compute them from the domain records
    const summary = { ...latestCheck.summary };
    if (summary.active === undefined) {
      const counts = await domains
        .aggregate([
          { $match: { checkId: latestCheck._id } },
          { $group: { _id: CATEGORY_EXPR, count: { $sum: 1 } } },
        ])
        .toArray();
      const byCategory = Object.fromEntries(counts.map((c) => [c._id, c.count]));
      summary.active = byCategory.active || 0;
      summary.failing = byCategory.failing || 0;
      summary.noDns = byCategory.no_dns || 0;
    }

    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [validChecks, discardedChecks, firstCheck, observations, eventsThisWeek] = await Promise.all([
      checks.countDocuments(VALID_CHECK_FILTER),
      checks.countDocuments({ valid: false }),
      checks.findOne({}, { sort: { checkedAt: 1 }, projection: { checkedAt: 1 } }),
      domains.estimatedDocumentCount(),
      events.countDocuments({ at: { $gte: weekAgo }, type: { $in: ['status', 'new_domain'] }, intermittent: { $ne: true } }),
    ]);

    const checkedAt: Date = latestCheck.checkedAt;
    const nextCheckAt = new Date(checkedAt.getTime() + CHECK_INTERVAL_HOURS * 3600000);

    return NextResponse.json({
      checkedAt,
      checkDuration: latestCheck.checkDuration,
      summary,
      monitoring: {
        intervalHours: CHECK_INTERVAL_HOURS,
        nextCheckAt,
        // If the next check is overdue by more than a full interval, something is wrong
        stale: Date.now() - checkedAt.getTime() > CHECK_INTERVAL_HOURS * 2 * 3600000,
        totalChecks: validChecks,
        discardedChecks,
        firstCheckAt: firstCheck?.checkedAt ?? null,
        observations,
        eventsThisWeek,
      },
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary data' },
      { status: 500 }
    );
  }
}
