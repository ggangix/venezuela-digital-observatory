import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';
import { exportQuerySchema } from '@/lib/validation';
import { toCSV } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const { format, status } = exportQuerySchema.parse(searchParams);

    const { checks, domains } = await getMonitorCollection();

    // Get the latest check
    const latestCheck = await checks.findOne({}, { sort: { checkedAt: -1 } });

    if (!latestCheck) {
      return NextResponse.json(
        { error: 'No data available' },
        { status: 404 }
      );
    }

    // Build filter
    const filter: Record<string, unknown> = {
      checkId: latestCheck._id,
    };

    if (status !== 'all') {
      filter.status = status;
    }

    // Get all matching domains
    const domainResults = await domains
      .find(filter)
      .sort({ domain: 1 })
      .project({
        _id: 0,
        domain: 1,
        status: 1,
        httpCode: 1,
        responseTime: 1,
        error: 1,
        'ssl.enabled': 1,
        'ssl.valid': 1,
        'ssl.issuer': 1,
        'ssl.daysUntilExpiry': 1,
        'headers.server': 1,
        finalUrl: 1,
        checkedAt: 1,
        reachability: 1,
      })
      .toArray();

    // Format response based on requested format
    if (format === 'csv') {
      const flatData = domainResults.map((d) => ({
        domain: d.domain,
        status: d.status,
        httpCode: d.httpCode || '',
        responseTime: d.responseTime || '',
        error: d.error || '',
        sslEnabled: d.ssl?.enabled ? 'true' : 'false',
        sslValid: d.ssl?.valid ? 'true' : 'false',
        sslIssuer: d.ssl?.issuer || '',
        sslDaysRemaining: d.ssl?.daysUntilExpiry ?? '',
        server: d.headers?.server || '',
        finalUrl: d.finalUrl || '',
        dnsOk: d.reachability?.dns?.ok === true ? 'true' : d.reachability?.dns?.ok === false ? 'false' : '',
        dnsIps: Array.isArray(d.reachability?.dns?.ips) ? d.reachability.dns.ips.join(';') : '',
        dnsError: d.reachability?.dns?.error || '',
        dnsTimeMs: d.reachability?.dns?.timeMs ?? '',
        tcpOk: d.reachability?.tcp?.ok === true ? 'true' : d.reachability?.tcp?.ok === false ? 'false' : '',
        tcpPort: d.reachability?.tcp?.port ?? '',
        tcpTimeMs: d.reachability?.tcp?.timeMs ?? '',
        tcpError: d.reachability?.tcp?.error || '',
        checkedAt: d.checkedAt?.toISOString() || '',
      }));

      const csv = toCSV(flatData);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ve-observatory-${status}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // JSON format
    const jsonData = {
      _meta: {
        exportedAt: new Date().toISOString(),
        checkedAt: latestCheck.checkedAt,
        filter: status,
        total: domainResults.length,
        license: 'CC0 - Public Domain',
        source: 'Venezuela Digital Observatory',
        url: 'https://venezueladigitalobservatory.com',
      },
      domains: domainResults,
    };

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ve-observatory-${status}-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
