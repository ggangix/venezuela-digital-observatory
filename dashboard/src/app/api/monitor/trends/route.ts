import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import { trendsQuerySchema } from '@/lib/validation';

export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const { days } = trendsQuerySchema.parse(searchParams);

    const { checks, domains } = await getMonitorCollection();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all checks in the time range
    const checkResults = await checks
      .find({ checkedAt: { $gte: startDate } })
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

    // Get slowest domains from latest check
    let slowestDomains: { domain: string; responseTime: number }[] = [];

    if (latestCheck) {
      const slowest = await domains
        .find({
          checkId: latestCheck._id,
          status: 'online',
          responseTime: { $gt: 0 },
        })
        .sort({ responseTime: -1 })
        .limit(10)
        .project({
          _id: 0,
          domain: 1,
          responseTime: 1,
        })
        .toArray();

      slowestDomains = slowest.map((d) => ({
        domain: d.domain,
        responseTime: d.responseTime || 0,
      }));
    }

    // Get HTTP code distribution from latest check
    let httpCodeDistribution: { code: string; count: number }[] = [];

    if (latestCheck) {
      const httpAggregation = await domains
        .aggregate([
          { $match: { checkId: latestCheck._id } },
          {
            $group: {
              _id: {
                $switch: {
                  branches: [
                    { case: { $and: [{ $gte: ['$httpCode', 200] }, { $lt: ['$httpCode', 300] }] }, then: '2xx' },
                    { case: { $and: [{ $gte: ['$httpCode', 300] }, { $lt: ['$httpCode', 400] }] }, then: '3xx' },
                    { case: { $and: [{ $gte: ['$httpCode', 400] }, { $lt: ['$httpCode', 500] }] }, then: '4xx' },
                    { case: { $and: [{ $gte: ['$httpCode', 500] }, { $lt: ['$httpCode', 600] }] }, then: '5xx' },
                  ],
                  default: 'error',
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray();

      httpCodeDistribution = httpAggregation.map((item) => ({
        code: item._id as string,
        count: item.count,
      }));
    }

    // Get server distribution from latest check
    let serverDistribution: { server: string; count: number }[] = [];

    if (latestCheck) {
      const serverAggregation = await domains
        .aggregate([
          { $match: { checkId: latestCheck._id, 'headers.server': { $exists: true, $ne: null } } },
          {
            $group: {
              _id: '$headers.server',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
        .toArray();

      serverDistribution = serverAggregation.map((item) => ({
        server: item._id as string,
        count: item.count,
      }));
    }

    // Format timeline data
    const timeline = checkResults.map((check) => ({
      date: check.checkedAt,
      online: check.summary?.online || 0,
      offline: check.summary?.offline || 0,
      total: check.summary?.totalDomains || 0,
      avgResponseTime: check.summary?.avgResponseTime || 0,
      withSSL: check.summary?.withSSL || 0,
      validSSL: check.summary?.validSSL || 0,
    }));

    // Get WHOIS data: expiring domains and nameserver distribution
    const { whois } = await getMonitorCollection();

    // Recently registered domains (last 2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const recentlyRegistered = await whois
      .find({
        registeredDate: { $gte: twoYearsAgo },
      })
      .sort({ registeredDate: -1 })
      .limit(10)
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

    return NextResponse.json({
      timeline,
      insights: {
        expiringSSL,
        expiredSSL,
        renewedSSL,
        inconsistentSSL,
        slowestDomains,
        recentlyRegistered: recentlyRegistered.map((d) => ({
          domain: d.domain,
          registeredDate: d.registeredDate,
          org: d.org,
        })),
      },
      distributions: {
        httpCodes: httpCodeDistribution,
        servers: serverDistribution,
        nameservers: nameserverDistribution,
      },
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
