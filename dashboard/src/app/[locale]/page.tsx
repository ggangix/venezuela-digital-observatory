'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import {
  ArrowRight,
  Github,
  Shield,
  Code,
  TrendingUp,
  ShieldX,
  Info,
  Rss,
  Activity,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LiveStatus, type MonitoringInfo } from '@/components/LiveStatus';
import { CategorySummary } from '@/components/CategorySummary';
import { EventList, type MonitorEvent } from '@/components/EventList';
import { formatDate } from '@/lib/utils';
import { CATEGORY_STYLE } from '@/lib/categories';
import type { CheckSummary } from '@/lib/checks';

type SummaryData = {
  checkedAt: string;
  checkDuration: number;
  summary: Required<CheckSummary>;
  monitoring: MonitoringInfo;
};

type TrendData = {
  timeline: {
    date: string;
    active: number;
    failing: number | null;
    noDns: number | null;
    total: number;
  }[];
  insights: {
    expiringSSL: { domain: string; daysUntilExpiry: number }[];
    expiredSSL: { domain: string; daysUntilExpiry: number }[];
  };
};

type EventsData = {
  events: MonitorEvent[];
  intermittentLast30Days: number;
  observing: unknown[];
};

export default function OverviewPage() {
  const t = useTranslations('overview');
  const tHome = useTranslations('home');
  const tTrends = useTranslations('trends');
  const tEvents = useTranslations('events');
  const tAnalysis = useTranslations('analysis');
  const tCat = useTranslations('categories');
  const tObs = useTranslations('observing');
  const locale = useLocale();

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [events, setEvents] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [summaryRes, trendsRes, eventsRes] = await Promise.all([
          fetch('/api/monitor/summary'),
          fetch('/api/monitor/trends?days=30'),
          fetch('/api/monitor/events?limit=8'),
        ]);

        if (summaryRes.ok) setSummary(await summaryRes.json());
        if (trendsRes.ok) setTrends(await trendsRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const chartData =
    trends?.timeline.map((point) => ({
      ...point,
      label: formatDate(point.date, locale),
    })) || [];

  const sslExpiringCount = trends?.insights?.expiringSSL?.length || 0;
  const sslExpiredCount = trends?.insights?.expiredSSL?.length || 0;

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-slate-900 dark:bg-slate-950">
        <div className="container mx-auto px-4 py-10 sm:py-12">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <div>
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                {t('title')}
              </h1>
              <p className="text-slate-400 sm:text-lg">{t('subtitle')}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  <RefreshCw className="h-3 w-3" />
                  {t('realTime')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  <Code className="h-3 w-3" />
                  Open Source
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  <Shield className="h-3 w-3" />
                  {t('publicData')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/${locale}/domains`}
                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
              >
                {t('viewAll')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/ggangix/venezuela-digital-observatory"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Monitoring status + headline */}
      <section className="container mx-auto space-y-6 px-4 py-8">
        {loading ? (
          <div className="card py-12 text-center">
            <p className="text-slate-500 dark:text-slate-400">{tHome('loading')}</p>
          </div>
        ) : summary ? (
          <>
            <LiveStatus
              checkedAt={summary.checkedAt}
              totalDomains={summary.summary.totalDomains}
              monitoring={summary.monitoring}
            />
            <CategorySummary
              totalDomains={summary.summary.totalDomains}
              active={summary.summary.active}
              failing={summary.summary.failing}
              noDns={summary.summary.noDns}
            />
          </>
        ) : (
          <div className="card py-12 text-center">
            <p className="text-slate-500 dark:text-slate-400">{t('loadError')}</p>
          </div>
        )}
      </section>

      {/* What changed + active sites trend */}
      {!loading && (
        <section className="container mx-auto px-4 pb-8">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card lg:col-span-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Activity className="h-5 w-5 text-blue-600" />
                  {tEvents('title')}
                </h2>
                <a
                  href="/feed.xml"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600"
                >
                  <Rss className="h-3.5 w-3.5" />
                  {tEvents('rss')}
                </a>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{tEvents('subtitle')}</p>
              {events && events.observing?.length > 0 && (
                <Link
                  href={`/${locale}/changes#observing`}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {tObs('homeLine', { count: events.observing.length })}
                </Link>
              )}
              <EventList events={events?.events || []} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                {events && events.intermittentLast30Days > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {tEvents('intermittentNote', { count: events.intermittentLast30Days })}
                  </span>
                ) : (
                  <span />
                )}
                <Link
                  href={`/${locale}/changes`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                >
                  {tEvents('viewAll')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="card lg:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  {tAnalysis('activeOverTime')}
                </h2>
                <span className="text-xs text-muted-foreground">{tTrends('period.30days')}</span>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">{tAnalysis('activeOverTimeDesc')}</p>
              {chartData.length > 0 ? (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[(min: number) => Math.floor((min - 10) / 10) * 10, (max: number) => Math.ceil((max + 10) / 10) * 10]} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-background)',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-foreground)',
                        }}
                        formatter={(value: number) => [value, tCat('active.label')]}
                      />
                      <Line type="monotone" dataKey="active" stroke={CATEGORY_STYLE.active.chart} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{tTrends('noData')}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SSL Insights */}
      {trends && (
        <section className="container mx-auto px-4 pb-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-600" />
                <span className="font-medium">{tTrends('insights.expiringSSL')}</span>
              </div>
              <p className="mb-2 text-2xl font-bold text-amber-600">{sslExpiringCount}</p>
              {trends.insights.expiringSSL.slice(0, 3).map((d) => (
                <Link
                  key={d.domain}
                  href={`/${locale}/domain/${encodeURIComponent(d.domain)}`}
                  className="mb-1 block truncate font-mono text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400"
                >
                  {d.domain} ({d.daysUntilExpiry}d)
                </Link>
              ))}
              {sslExpiringCount === 0 && <p className="text-xs text-slate-400">{tTrends('noCertificates')}</p>}
            </div>

            <div className="card">
              <div className="mb-3 flex items-center gap-2">
                <ShieldX className="h-5 w-5 text-red-600" />
                <span className="font-medium">{tTrends('insights.expiredSSL')}</span>
              </div>
              <p className="mb-2 text-2xl font-bold text-red-600">{sslExpiredCount}</p>
              {trends.insights.expiredSSL?.slice(0, 3).map((d) => (
                <Link
                  key={d.domain}
                  href={`/${locale}/domain/${encodeURIComponent(d.domain)}`}
                  className="mb-1 block truncate font-mono text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400"
                >
                  {d.domain} ({Math.abs(d.daysUntilExpiry)}d)
                </Link>
              ))}
              {sslExpiredCount === 0 && <p className="text-xs text-slate-400">{tTrends('noExpiredCertificates')}</p>}
            </div>
          </div>
        </section>
      )}

      {/* Links Row */}
      <section className="container mx-auto px-4 pb-12">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/${locale}/trends`}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <TrendingUp className="h-4 w-4" />
            {tHome('viewAllTrends')}
          </Link>
          <Link
            href={`/${locale}/about`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Info className="h-4 w-4" />
            {tHome('learnMore')}
          </Link>
        </div>
      </section>
    </div>
  );
}
