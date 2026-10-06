import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import { domainsQuerySchema } from '@/lib/validation';
import { categorize, getLatestValidCheck, type DomainRecord } from '@/lib/checks';
import { classifyDomain } from '@/lib/classify';

export const revalidate = 60; // Cache for 60 seconds

const CATEGORY_ORDER = { active: 0, failing: 1, no_dns: 2 } as const;

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const query = domainsQuerySchema.parse(searchParams);

    const { checks, domains, state, whois } = await getMonitorCollection();

    const latestCheck = await getLatestValidCheck(checks);

    if (!latestCheck) {
      return NextResponse.json({ domains: [], total: 0, page: 1, limit: query.limit });
    }

    // Filters that map directly to stored fields run in MongoDB
    const filter: Record<string, unknown> = { checkId: latestCheck._id };

    if (query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.ssl !== 'all') {
      switch (query.ssl) {
        case 'valid':
          filter['ssl.valid'] = true;
          break;
        case 'invalid':
          filter['ssl.enabled'] = true;
          filter['ssl.valid'] = false;
          break;
        case 'none':
          filter.$or = [{ ssl: null }, { 'ssl.enabled': false }];
          break;
      }
    }

    if (query.search) {
      // Escape special regex characters to prevent ReDoS
      const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.domain = { $regex: escapedSearch, $options: 'i' };
    }

    if (query.httpCode !== 'all') {
      switch (query.httpCode) {
        case '2xx':
          filter.httpCode = { $gte: 200, $lt: 300 };
          break;
        case '3xx':
          filter.httpCode = { $gte: 300, $lt: 400 };
          break;
        case '4xx':
          filter.httpCode = { $gte: 400, $lt: 500 };
          break;
        case '5xx':
          filter.httpCode = { $gte: 500, $lt: 600 };
          break;
        case 'error':
          filter.$or = [{ httpCode: null }, { httpCode: 0 }];
          break;
      }
    }

    // One check holds ~2,600 small records: join with per-domain state and
    // name-based classification in memory, then filter, sort and paginate.
    const [records, states, whoisRows] = await Promise.all([
      domains
        .find(filter)
        .project<DomainRecord>({
          _id: 0,
          domain: 1,
          status: 1,
          category: 1,
          error: 1,
          'reachability.dns.ok': 1,
          httpCode: 1,
          responseTime: 1,
          ssl: 1,
          'headers.server': 1,
          'hosting.asName': 1,
          'hosting.country': 1,
          checkedAt: 1,
          finalUrl: 1,
        })
        .toArray(),
      state
        .find({})
        .project({ _id: 0, domain: 1, since: 1, firstSeenAt: 1, intermittent: 1, lastActiveAt: 1, firstActiveAt: 1 })
        .toArray(),
      whois.find({}).project({ _id: 0, domain: 1, registeredDate: 1, org: 1 }).toArray(),
    ]);
    const stateByDomain = new Map(states.map((s) => [s.domain, s]));
    const whoisByDomain = new Map(whoisRows.map((w) => [w.domain, w]));

    let rows = records.map((r) => {
      const s = stateByDomain.get(r.domain);
      const classification = classifyDomain(r.domain);
      return {
        ...r,
        category: categorize(r),
        since: s?.since ?? null,
        // Unchanged since monitoring started: the real start date is unknown
        sinceStart: !!s?.since && String(s.since) === String(s.firstSeenAt),
        intermittent: s?.intermittent === true,
        lastActiveAt: s?.lastActiveAt ?? null,
        everActive: !!s?.firstActiveAt,
        registeredDate: (whoisByDomain.get(r.domain)?.registeredDate as Date | null) ?? null,
        org: (whoisByDomain.get(r.domain)?.org as string | null) ?? null,
        ...classification,
      };
    });

    if (query.level !== 'all') rows = rows.filter((r) => r.level === query.level);
    if (query.state) rows = rows.filter((r) => r.state === query.state);
    if (query.year) rows = rows.filter((r) => r.registeredDate && new Date(r.registeredDate).getUTCFullYear() === query.year);

    // Counts per availability tab, given every other filter
    const categoryCounts = {
      all: rows.length,
      active: rows.filter((r) => r.category === 'active').length,
      failing: rows.filter((r) => r.category === 'failing').length,
      no_dns: rows.filter((r) => r.category === 'no_dns').length,
      intermittent: rows.filter((r) => r.intermittent).length,
    };

    if (query.category === 'intermittent') rows = rows.filter((r) => r.intermittent);
    else if (query.category !== 'all') rows = rows.filter((r) => r.category === query.category);

    const dir = query.order === 'asc' ? 1 : -1;
    const value = (r: (typeof rows)[number]): number | string => {
      switch (query.sort) {
        case 'status':
          return CATEGORY_ORDER[r.category];
        case 'domain':
          return r.domain;
        case 'since':
          return r.since ? new Date(r.since).getTime() : 0;
        case 'registered':
          return r.registeredDate ? new Date(r.registeredDate).getTime() : 0;
        case 'checkedAt':
          return new Date(r.checkedAt).getTime();
        default:
          return r[query.sort] ?? Number.MAX_SAFE_INTEGER;
      }
    };
    rows.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.domain.localeCompare(b.domain);
    });

    const total = rows.length;
    const skip = (query.page - 1) * query.limit;

    return NextResponse.json({
      domains: rows.slice(skip, skip + query.limit),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
      categoryCounts,
    });
  } catch (error) {
    console.error('Error fetching domains:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    );
  }
}
