import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import { CATEGORY_EXPR, NOT_DISCARDED_FILTER, categorize } from '@/lib/checks';
import { classifyDomain } from '@/lib/classify';

export const revalidate = 60;

const STRIP_LENGTH = 120; // last 120 checks = 30 days at one check every 6h

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const domainName = decodeURIComponent(name);
    const historyLimit = parseInt(request.nextUrl.searchParams.get('history') || '10');

    const { domains, whois, state, events } = await getMonitorCollection();
    const domainFilter = { domain: domainName, ...NOT_DISCARDED_FILTER };

    // Latest records (also used for the status strip)
    const recent = await domains
      .find(domainFilter)
      .sort({ checkedAt: -1 })
      .limit(Math.max(STRIP_LENGTH, Math.min(historyLimit, 100)))
      .project({
        _id: 0,
        checkId: 1,
        checkedAt: 1,
        status: 1,
        category: 1,
        httpCode: 1,
        responseTime: 1,
        error: 1,
        ssl: 1,
        headers: 1,
        redirects: 1,
        finalUrl: 1,
        reachability: 1,
        hosting: 1,
      })
      .toArray();

    if (recent.length === 0) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      );
    }

    const now = Date.now();
    const uptimeSince = (days: number) =>
      domains
        .aggregate([
          { $match: { ...domainFilter, checkedAt: { $gte: new Date(now - days * 86400000) } } },
          { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: [CATEGORY_EXPR, 'active'] }, 1, 0] } } } },
        ])
        .toArray()
        .then((r) => (r[0] ? { checks: r[0].total, active: r[0].active } : { checks: 0, active: 0 }));

    const [whoisData, domainState, domainEvents, uptime30, uptime90, totals] = await Promise.all([
      whois.findOne(
        { domain: domainName },
        {
          projection: {
            _id: 0,
            registrar: 1,
            registeredDate: 1,
            expireDate: 1,
            org: 1,
            nameservers: 1,
          },
        }
      ),
      state.findOne(
        { domain: domainName },
        { projection: { _id: 0, pending: 0, pendingHosting: 0, recentChanges: 0 } }
      ),
      events.find({ domain: domainName }).sort({ at: -1 }).limit(50).project({ _id: 0, checkId: 0 }).toArray(),
      uptimeSince(30),
      uptimeSince(90),
      domains.countDocuments(domainFilter),
    ]);

    const latest = recent[0];

    return NextResponse.json({
      domain: domainName,
      classification: classifyDomain(domainName),
      current: { ...latest, category: categorize(latest) },
      history: recent.slice(0, Math.min(historyLimit, 100)),
      strip: recent
        .slice(0, STRIP_LENGTH)
        .reverse()
        .map((r) => ({ checkedAt: r.checkedAt, category: categorize(r), httpCode: r.httpCode ?? null })),
      state: domainState,
      events: domainEvents,
      uptime: { last30Days: uptime30, last90Days: uptime90, totalChecks: totals },
      whois: whoisData || null,
    });
  } catch (error) {
    console.error('Error fetching domain details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domain details' },
      { status: 500 }
    );
  }
}
