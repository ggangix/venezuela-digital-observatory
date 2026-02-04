import { NextRequest, NextResponse } from 'next/server';
import { getMonitorCollection } from '@/lib/mongodb';

export const revalidate = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const domainName = decodeURIComponent(name);
    const historyLimit = parseInt(request.nextUrl.searchParams.get('history') || '10');

    const { domains } = await getMonitorCollection();

    // Get latest status and history for this domain
    const history = await domains
      .find({ domain: domainName })
      .sort({ checkedAt: -1 })
      .limit(Math.min(historyLimit, 100))
      .project({
        _id: 0,
        checkId: 1,
        checkedAt: 1,
        status: 1,
        httpCode: 1,
        responseTime: 1,
        error: 1,
        ssl: 1,
        headers: 1,
        redirects: 1,
        finalUrl: 1,
        reachability: 1,
      })
      .toArray();

    if (history.length === 0) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      );
    }

    // Latest status is the first item
    const latest = history[0];

    return NextResponse.json({
      domain: domainName,
      current: latest,
      history: history,
    });
  } catch (error) {
    console.error('Error fetching domain details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domain details' },
      { status: 500 }
    );
  }
}
