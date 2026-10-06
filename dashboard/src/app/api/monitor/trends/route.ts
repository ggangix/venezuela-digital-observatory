import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import { trendsQuerySchema } from '@/lib/validation';
import { VALID_CHECK_FILTER, categorize, type DomainRecord } from '@/lib/checks';
import { classifyDomain, LEVELS, VE_STATES } from '@/lib/classify';
import { groupNameserver } from '@/lib/hosting';

export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const { days } = trendsQuerySchema.parse(searchParams);

    const { checks, domains, whois } = await getMonitorCollection();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all valid checks in the time range (discarded checks are monitor failures)
    const checkResults = await checks
      .find({ checkedAt: { $gte: startDate }, ...VALID_CHECK_FILTER })
      .sort({ checkedAt: 1 })
      .project({
        _id: 1,
        checkedAt: 1,
        checkDuration: 1,
        summary: 1,
      })
      .toArray();

    // Get domains with SSL expiring soon (from latest check)
    const latestCheck = checkResults[checkResults.length - 1];
    let expiringSSL: { domain: string; daysUntilExpiry: number }[] = [];
    let expiredSSL: { domain: string; daysUntilExpiry: number }[] = [];
    let renewedSSL: { domain: string; daysUntilExpiry: number }[] = [];
    let inconsistentSSL: { domain: string; issue: string }[] = [];

    // First, detect inconsistent SSL certificates (need this before expired to filter them out)
    // These are domains where different servers serve different certificates
    const inconsistentWithValidSSL = new Set<string>();

    if (latestCheck && checkResults.length >= 3) {
      const recentChecks = checkResults.slice(-5);
      const checkIds = recentChecks.map(c => c._id);

      const sslAcrossChecks = await domains
        .aggregate([
          {
            $match: {
              checkId: { $in: checkIds },
              'ssl.enabled': true,
              'ssl.subject': { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: '$domain',
              subjects: { $addToSet: '$ssl.subject' },
              issuers: { $addToSet: '$ssl.issuer' },
              validFromDates: { $addToSet: '$ssl.validFrom' },
              // Consider "not expired" if daysUntilExpiry > 0 (even if ssl.valid is false due to untrusted CA)
              hasNonExpiredCert: { $max: { $cond: [{ $gt: ['$ssl.daysUntilExpiry', 0] }, 1, 0] } },
              checksCount: { $sum: 1 },
            },
          },
          {
            $match: {
              checksCount: { $gte: 2 },
              $or: [
                { 'subjects.1': { $exists: true } },
                { 'issuers.1': { $exists: true } },
              ],
            },
          },
          { $limit: 10 },
        ])
        .toArray();

      inconsistentSSL = sslAcrossChecks.map((d) => {
        let issue = '';
        if (d.subjects.length > 1) {
          issue = `${d.subjects.length} different certificates`;
        } else if (d.issuers.length > 1) {
          issue = `${d.issuers.length} different issuers`;
        }
        // Track domains that are inconsistent but have at least one non-expired cert
        if (d.hasNonExpiredCert === 1) {
          inconsistentWithValidSSL.add(d._id as string);
        }
        return {
          domain: d._id as string,
          issue,
        };
      });
    }

    if (latestCheck) {
      // SSL expiring soon (0 < days <= 30)
      const sslExpiring = await domains
        .find({
          checkId: latestCheck._id,
          'ssl.valid': true,
          'ssl.daysUntilExpiry': { $lte: 30, $gt: 0 },
        })
        .sort({ 'ssl.daysUntilExpiry': 1 })
        .limit(10)
        .project({
          _id: 0,
          domain: 1,
          'ssl.daysUntilExpiry': 1,
        })
        .toArray();

      expiringSSL = sslExpiring.map((d) => ({
        domain: d.domain,
        daysUntilExpiry: d.ssl?.daysUntilExpiry || 0,
      }));

      // SSL recently expired (days <= 0, expired in last 90 days)
      // Exclude domains that have inconsistent SSL but at least one valid certificate
      const sslExpired = await domains
        .find({
          checkId: latestCheck._id,
          'ssl.enabled': true,
          'ssl.daysUntilExpiry': { $lte: 0, $gte: -90 },
        })
        .sort({ 'ssl.daysUntilExpiry': -1 })
        .limit(100)
        .project({
          _id: 0,
          domain: 1,
          'ssl.daysUntilExpiry': 1,
        })
        .toArray();

      expiredSSL = sslExpired
        .filter((d) => !inconsistentWithValidSSL.has(d.domain))
        .map((d) => ({
          domain: d.domain,
          daysUntilExpiry: d.ssl?.daysUntilExpiry || 0,
        }));

      // SSL recently renewed/issued: certificates issued in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentlyIssuedSSL = await domains
        .find({
          checkId: latestCheck._id,
          'ssl.valid': true,
          'ssl.validFrom': { $gte: thirtyDaysAgo },
        })
        .sort({ 'ssl.validFrom': -1 })
        .limit(50)
        .project({
          _id: 0,
          domain: 1,
          'ssl.daysUntilExpiry': 1,
          'ssl.validFrom': 1,
        })
        .toArray();

      renewedSSL = recentlyIssuedSSL.map(d => ({
        domain: d.domain,
        daysUntilExpiry: d.ssl?.daysUntilExpiry || 0,
      }));
    }

    // Category counts over time. Checks saved before categories existed only have
    // online/offline: active == online, and failing/noDns are filled in by the
    // monitor's history rebuild; until then they are null.
    const timeline = checkResults.map((check) => ({
      date: check.checkedAt,
      active: check.summary?.active ?? check.summary?.online ?? 0,
      failing: check.summary?.failing ?? null,
      noDns: check.summary?.noDns ?? null,
      total: check.summary?.totalDomains || 0,
    }));

    // Latest check, joined with name-based classification
    const latestRecords = latestCheck
      ? await domains
          .find({ checkId: latestCheck._id })
          .project<DomainRecord>({
            _id: 0,
            domain: 1,
            status: 1,
            category: 1,
            error: 1,
            'reachability.dns.ok': 1,
            'ssl.enabled': 1,
            'ssl.valid': 1,
            headers: 1,
            hosting: 1,
          })
          .toArray()
      : [];
    const rows = latestRecords.map((r) => ({ ...r, category: categorize(r), ...classifyDomain(r.domain) }));
    const activeRows = rows.filter((r) => r.category === 'active');

    // Availability by government level and by state (estimated from domain names)
    const byLevel = LEVELS.map((level) => {
      const inLevel = rows.filter((r) => r.level === level);
      return {
        level,
        total: inLevel.length,
        active: inLevel.filter((r) => r.category === 'active').length,
        failing: inLevel.filter((r) => r.category === 'failing').length,
        noDns: inLevel.filter((r) => r.category === 'no_dns').length,
      };
    });
    const byState = VE_STATES.map((st) => {
      const inState = rows.filter((r) => r.state === st.id);
      return {
        state: st.id,
        name: st.name,
        total: inState.length,
        active: inState.filter((r) => r.category === 'active').length,
      };
    })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.active / b.total - a.active / a.total || b.total - a.total);

    // Security posture of active sites (aggregate only, never per-site software versions)
    const hstsMeasured = activeRows.some((r) => r.headers && 'hsts' in r.headers);
    const security = {
      active: activeRows.length,
      https: activeRows.filter((r) => r.ssl?.enabled).length,
      validCertificate: activeRows.filter((r) => r.ssl?.valid).length,
      hsts: hstsMeasured ? activeRows.filter((r) => r.headers?.hsts).length : null,
    };

    // Hosting network of every domain that resolves (needs the monitor's ASN lookup)
    const hostedRows = rows.filter((r): r is typeof r & { hosting: NonNullable<DomainRecord['hosting']> } => !!r.hosting?.asn);
    const networkCounts = new Map<string, { network: string; country: string | null; total: number; active: number }>();
    for (const r of hostedRows) {
      const key = String(r.hosting.asn);
      const entry = networkCounts.get(key) || { network: r.hosting.asName || `AS${r.hosting.asn}`, country: r.hosting.country || null, total: 0, active: 0 };
      entry.total++;
      if (r.category === 'active') entry.active++;
      networkCounts.set(key, entry);
    }
    const hostingCountries = new Map<string, number>();
    for (const r of hostedRows) {
      const c = r.hosting.country || '??';
      hostingCountries.set(c, (hostingCountries.get(c) || 0) + 1);
    }
    const hosting = {
      measured: hostedRows.length,
      networks: Array.from(networkCounts.values()).sort((a, b) => b.total - a.total).slice(0, 12),
      countries: Array.from(hostingCountries.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count),
    };

    // Domains registered per year: how the state's web presence grew over time
    const registrationsByYear = await whois
      .aggregate([
        { $match: { registeredDate: { $ne: null } } },
        { $group: { _id: { $year: '$registeredDate' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    // Recently registered domains (last 2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const recentlyRegistered = await whois
      .find({
        registeredDate: { $gte: twoYearsAgo },
      })
      .sort({ registeredDate: -1 })
      .limit(200)
      .project({
        _id: 0,
        domain: 1,
        registeredDate: 1,
        org: 1,
      })
      .toArray();

    // Nameserver distribution (aggregate all nameservers)
    const nameserverAggregation = await whois
      .aggregate([
        { $unwind: '$nameservers' },
        {
          $group: {
            _id: {
              $toLower: {
                $arrayElemAt: [
                  { $split: ['$nameservers', '.'] },
                  { $subtract: [{ $size: { $split: ['$nameservers', '.'] } }, 2] }
                ]
              }
            },
            count: { $sum: 1 },
            fullExample: { $first: '$nameservers' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ])
      .toArray();

    const nameserverDistribution = nameserverAggregation.map((item) => ({
      provider: item._id as string,
      count: item.count,
      example: item.fullExample as string,
    }));

    // Who runs the DNS of each domain: the state, Venezuelan companies or foreign providers
    const nameserverRows = await whois.find({}).project({ _id: 0, nameservers: 1 }).toArray();
    const nameserverGroups = { state: 0, national: 0, foreign: 0, none: 0 };
    for (const r of nameserverRows) {
      const first = r.nameservers?.[0];
      nameserverGroups[first ? groupNameserver(first) : 'none']++;
    }

    return NextResponse.json({
      timeline,
      monitoring: {
        checksInPeriod: checkResults.length,
        discardedInPeriod: await checks.countDocuments({ checkedAt: { $gte: startDate }, valid: false }),
      },
      insights: {
        expiringSSL,
        expiredSSL,
        renewedSSL,
        inconsistentSSL,
        recentlyRegistered: recentlyRegistered.map((d) => ({
          domain: d.domain,
          registeredDate: d.registeredDate,
          org: d.org,
        })),
      },
      distributions: {
        nameservers: nameserverDistribution,
        nameserverGroups,
        registrationsByYear: registrationsByYear.map((r) => ({ year: r._id as number, count: r.count as number })),
        byLevel,
        byState,
      },
      security,
      hosting,
      period: {
        start: startDate,
        end: new Date(),
        days,
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch trends data' },
      { status: 500 }
    );
  }
}
