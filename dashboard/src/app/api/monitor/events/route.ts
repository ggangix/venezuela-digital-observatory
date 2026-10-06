import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import { eventsQuerySchema } from '@/lib/validation';
import { classifyDomain } from '@/lib/classify';

export const revalidate = 300;

// Change types shown in the public feed. SSL renewals are routine (Let's Encrypt
// renews every ~60 days) and only listed when explicitly requested.
const FEED_TYPES = ['status', 'new_domain', 'hosting_change', 'ssl_expired'];

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const query = eventsQuerySchema.parse(searchParams);
    const { events, state } = await getMonitorCollection();

    const filter: Record<string, unknown> = {};
    filter.type = query.type === 'all' ? { $in: FEED_TYPES } : query.type;
    if (query.domain) filter.domain = query.domain;
    if (!query.intermittent && !query.domain) filter.intermittent = { $ne: true };
    if (query.before) filter.at = { $lt: new Date(query.before) };
    if (query.direction === 'up') filter.to = 'active';
    if (query.direction === 'down') filter.from = 'active';

    // Changes seen in the latest checks but not confirmed yet ("en observación")
    const observingPromise =
      query.domain || query.before
        ? Promise.resolve([])
        : state
            .find({ pending: { $ne: null }, $expr: { $ne: ['$pending.category', '$category'] } })
            .project({ _id: 0, domain: 1, category: 1, pending: 1, intermittent: 1 })
            // Closest to being confirmed first
            .sort({ 'pending.count': -1, 'pending.since': 1 })
            .limit(200)
            .toArray();

    const [items, intermittentCount, observingRaw] = await Promise.all([
      events
        .find(filter)
        .sort({ at: -1 })
        .limit(query.limit)
        .project({ _id: 0, checkId: 0 })
        .toArray(),
      // How many changes were grouped as intermittent in the last 30 days
      query.domain
        ? Promise.resolve(0)
        : events.countDocuments({
            type: 'status',
            intermittent: true,
            at: { $gte: new Date(Date.now() - 30 * 86400000) },
          }),
      observingPromise,
    ]);

    const observing = observingRaw
      .filter((s) => query.intermittent || !s.intermittent)
      .filter((s) => query.direction === 'all' || (query.direction === 'up' ? s.pending.category === 'active' : s.category === 'active'))
      .map((s) => ({
        domain: s.domain,
        from: s.category,
        to: s.pending.category,
        since: s.pending.since,
        checks: s.pending.count,
        intermittent: s.intermittent === true,
        classification: classifyDomain(s.domain),
      }));

    return NextResponse.json({
      events: items.map((e) => ({ ...e, classification: classifyDomain(e.domain) })),
      intermittentLast30Days: intermittentCount,
      observing,
      nextBefore: items.length === query.limit ? items[items.length - 1].at : null,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
