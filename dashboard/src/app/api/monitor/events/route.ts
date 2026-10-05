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
    const { events } = await getMonitorCollection();

    const filter: Record<string, unknown> = {};
    filter.type = query.type === 'all' ? { $in: FEED_TYPES } : query.type;
    if (query.domain) filter.domain = query.domain;
    if (!query.intermittent && !query.domain) filter.intermittent = { $ne: true };
    if (query.before) filter.at = { $lt: new Date(query.before) };
    if (query.direction === 'up') filter.to = 'active';
    if (query.direction === 'down') filter.from = 'active';

    const [items, intermittentCount] = await Promise.all([
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
    ]);

    return NextResponse.json({
      events: items.map((e) => ({ ...e, classification: classifyDomain(e.domain) })),
      intermittentLast30Days: intermittentCount,
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
