'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Server,
  Globe,
  CalendarPlus,
  ChevronDown,
  Layers,
  MapPin,
  Lock,
  History,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { cn, formatDate, formatNumberWithSeparator, percentage } from '@/lib/utils';
import { CATEGORY_STYLE } from '@/lib/categories';

type DomainDays = { domain: string; daysUntilExpiry: number };

type TrendData = {
  timeline: { date: string; active: number; failing: number | null; noDns: number | null; total: number }[];
  monitoring: { checksInPeriod: number; discardedInPeriod: number };
  insights: {
    expiringSSL: DomainDays[];
    expiredSSL: DomainDays[];
    renewedSSL: DomainDays[];
    inconsistentSSL: { domain: string; issue: string }[];
    recentlyRegistered: { domain: string; registeredDate: string; org: string }[];
  };
  distributions: {
    nameservers: { provider: string; count: number; example: string }[];
    nameserverGroups: { state: number; national: number; foreign: number; none: number };
    registrationsByYear: { year: number; count: number }[];
    byLevel: { level: string; total: number; active: number; failing: number; noDns: number }[];
    byState: { state: string; name: string; total: number; active: number }[];
  };
  security: { active: number; https: number; validCertificate: number; hsts: number | null };
  hosting: {
    measured: number;
    networks: { network: string; country: string | null; total: number; active: number }[];
    countries: { country: string; count: number }[];
  };
};

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-background)',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  color: 'var(--color-foreground)',
};

function DomainDaysList({
  items,
  tone,
  emptyText,
  daysLabel,
  locale,
  showMoreLabel,
}: {
  items: DomainDays[];
  tone: 'red' | 'amber' | 'green';
  emptyText: string;
  daysLabel: string;
  locale: string;
  showMoreLabel: string;
}) {
  const [visible, setVisible] = useState(10);
  const toneClass = {
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }[tone];

  if (items.length === 0) return <p className="py-4 text-center text-muted-foreground">{emptyText}</p>;

  return (
    <>
      <ol className="space-y-2">
        {items.slice(0, visible).map((d) => (
          <li key={d.domain} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <Link href={`/${locale}/domain/${encodeURIComponent(d.domain)}`} className="font-mono text-sm hover:text-primary hover:underline">
              {d.domain}
            </Link>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', toneClass)}>
              {Math.abs(d.daysUntilExpiry)} {daysLabel}
            </span>
          </li>
        ))}
      </ol>
      {items.length > visible && (
        <button
          onClick={() => setVisible((prev) => prev + 10)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <ChevronDown className="h-4 w-4" />
          {showMoreLabel} ({items.length - visible})
        </button>
      )}
    </>
  );
}

function Meter({ label, value, total, className }: { label: string; value: number; total: number; className?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value} · {percentage(value, total)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn('h-full rounded-full', className || 'bg-blue-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const t = useTranslations('trends');
  const ta = useTranslations('analysis');
  const tc = useTranslations('categories');
  const tl = useTranslations('levels');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [visibleRegistered, setVisibleRegistered] = useState(10);

  useEffect(() => {
    async function fetchTrends() {
      setLoading(true);
      try {
        const res = await fetch(`/api/monitor/trends?days=${days}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (error) {
        console.error('Failed to fetch trends:', error);
      }
      setLoading(false);
    }
    fetchTrends();
  }, [days]);

  const chartData =
    data?.timeline.map((point) => ({
      ...point,
      label: formatDate(point.date, locale),
    })) || [];
  const hasCategoryHistory = chartData.some((p) => p.failing !== null);

  const levelData =
    data?.distributions.byLevel
      .filter((l) => l.total > 0)
      .map((l) => ({ ...l, name: tl(l.level) })) || [];

  const registrationsTotal = data?.distributions.registrationsByYear.reduce((sum, r) => sum + r.count, 0) || 0;

  const nameserverData =
    data?.distributions?.nameservers?.slice(0, 10).map((item) => ({
      name: item.provider.length > 15 ? item.provider.substring(0, 15) + '...' : item.provider,
      fullName: item.example,
      count: item.count,
    })) || [];

  const formatTimeAgo = (registeredDate: string) => {
    const daysAgo = Math.ceil((Date.now() - new Date(registeredDate).getTime()) / 86400000);
    if (daysAgo < 30) return `${daysAgo} ${t('time.days')}`;
    if (daysAgo < 365) return `${Math.floor(daysAgo / 30)} ${t('time.months')}`;
    return `${Math.floor(daysAgo / 365)} ${t('time.years')}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Period selector */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`btn ${days === d ? 'btn-primary' : 'btn-outline'}`}>
            {t(`period.${d}days`)}
          </button>
        ))}
        {data && data.monitoring.discardedInPeriod > 0 && (
          <span className="text-xs text-muted-foreground">{ta('discarded', { count: data.monitoring.discardedInPeriod })}</span>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{tCommon('loading')}</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Status of every domain over time */}
          <div className="card">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <History className="h-5 w-5 text-green-600" />
              {hasCategoryHistory ? ta('infraOverTime') : ta('activeOverTime')}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {ta('activeOverTimeDesc')}
              {hasCategoryHistory && chartData.length > 0 && (
                <> {ta('noDnsHidden', { count: formatNumberWithSeparator(chartData[chartData.length - 1].noDns || 0, locale) })}</>
              )}
            </p>
            {chartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={40} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [value, tc(`${name === 'noDns' ? 'no_dns' : name}.label`)]} />
                    <Legend formatter={(value: string) => tc(`${value === 'noDns' ? 'no_dns' : value}.label`)} />
                    <Area type="monotone" dataKey="active" stackId="1" stroke={CATEGORY_STYLE.active.chart} fill={CATEGORY_STYLE.active.chart} fillOpacity={0.7} />
                    {hasCategoryHistory && (
                      <Area type="monotone" dataKey="failing" stackId="1" stroke={CATEGORY_STYLE.failing.chart} fill={CATEGORY_STYLE.failing.chart} fillOpacity={0.6} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">{t('noData')}</p>
            )}
          </div>

          {/* By level / by state */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <Layers className="h-5 w-5 text-indigo-600" />
                {ta('byLevel')}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">{ta('byLevelDesc')}</p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={levelData} layout="vertical" stackOffset="expand" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string, item: { payload?: { total: number } }) => [
                        `${value} (${percentage(value, item.payload?.total || 0)})`,
                        tc(`${name === 'noDns' ? 'no_dns' : name}.label`),
                      ]}
                    />
                    <Bar dataKey="active" stackId="a" fill={CATEGORY_STYLE.active.chart} />
                    <Bar dataKey="failing" stackId="a" fill={CATEGORY_STYLE.failing.chart} />
                    <Bar dataKey="noDns" stackId="a" fill={CATEGORY_STYLE.no_dns.chart} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {levelData.map((l) => (
                  <li key={l.level}>
                    {l.name}: {ta('activeOf', { active: l.active, total: formatNumberWithSeparator(l.total, locale) })}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <MapPin className="h-5 w-5 text-rose-600" />
                {ta('byState')}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">{ta('byStateDesc')}</p>
              <ol className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {data.distributions.byState.map((s) => (
                  <li key={s.state}>
                    <Link href={`/${locale}/domains?state=${s.state}`} className="block hover:text-blue-600">
                      <Meter label={s.name} value={s.active} total={s.total} className={CATEGORY_STYLE.active.bar} />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Registrations per year / DNS operators */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <CalendarPlus className="h-5 w-5 text-emerald-600" />
                {ta('registrations')}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {ta('registrationsDesc', { total: formatNumberWithSeparator(registrationsTotal, locale) })}
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.distributions.registrationsByYear} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, t('legend.domains')]} />
                    <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <Globe className="h-5 w-5 text-cyan-600" />
                {ta('nameserverGroups')}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">{ta('nameserverGroupsDesc')}</p>
              {(() => {
                const g = data.distributions.nameserverGroups;
                const total = g.state + g.national + g.foreign + g.none;
                return (
                  <div className="mb-5 space-y-3">
                    <Meter label={ta('nsGroups.state')} value={g.state} total={total} className="bg-blue-500" />
                    <Meter label={ta('nsGroups.national')} value={g.national} total={total} className="bg-cyan-500" />
                    <Meter label={ta('nsGroups.foreign')} value={g.foreign} total={total} className="bg-orange-500" />
                    <Meter label={ta('nsGroups.none')} value={g.none} total={total} className="bg-slate-400" />
                  </div>
                );
              })()}
              {nameserverData.length > 0 && (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nameserverData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={100} />
                      <Tooltip
                        formatter={(value: number) => [value, t('legend.domains')]}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Hosting / security */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <Server className="h-5 w-5 text-violet-600" />
                {ta('hosting')}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">{ta('hostingDesc')}</p>
              {data.hosting.measured === 0 ? (
                <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-muted-foreground dark:bg-slate-800">{ta('measuringSoon')}</p>
              ) : (
                <>
                  <div className="mb-4 space-y-2">
                    {data.hosting.networks.map((n) => (
                      <Meter
                        key={n.network}
                        label={`${n.network}${n.country ? ` (${n.country})` : ''}`}
                        value={n.total}
                        total={data.hosting.measured}
                        className="bg-violet-500"
                      />
                    ))}
                  </div>
                  <p className="mb-2 text-sm font-medium">{ta('hostingCountries')}</p>
                  <div className="flex flex-wrap gap-2">
                    {data.hosting.countries.map((c) => (
                      <span key={c.country} className="badge badge-ssl-none">
                        {c.country} · {percentage(c.count, data.hosting.measured)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <Lock className="h-5 w-5 text-blue-600" />
                {ta('security')}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">{ta('securityDesc')}</p>
              <div className="space-y-4">
                <Meter label={ta('https')} value={data.security.https} total={data.security.active} className="bg-blue-500" />
                <Meter label={ta('validCert')} value={data.security.validCertificate} total={data.security.active} className="bg-emerald-500" />
                {data.security.hsts === null ? (
                  <div>
                    <p className="mb-1 text-sm">{ta('hsts')}</p>
                    <p className="text-xs text-muted-foreground">{ta('measuringSoon')}</p>
                  </div>
                ) : (
                  <Meter label={ta('hsts')} value={data.security.hsts} total={data.security.active} className="bg-indigo-500" />
                )}
              </div>
            </div>
          </div>

          {/* SSL certificates */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-5 w-5 text-amber-600" />
                {t('insights.expiringSSL')}
              </h2>
              <DomainDaysList items={data.insights.expiringSSL} tone="amber" emptyText={t('noCertificates')} daysLabel={t('table.days')} locale={locale} showMoreLabel={t('showMore')} />
            </div>
            <div className="card">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <ShieldX className="h-5 w-5 text-red-600" />
                {t('insights.expiredSSL')}
              </h2>
              <DomainDaysList items={data.insights.expiredSSL || []} tone="red" emptyText={t('noExpiredCertificates')} daysLabel={t('table.days')} locale={locale} showMoreLabel={t('showMore')} />
            </div>
            <div className="card">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                {t('insights.renewedSSL')}
              </h2>
              <DomainDaysList items={data.insights.renewedSSL || []} tone="green" emptyText={t('noRenewedCertificates')} daysLabel={t('table.days')} locale={locale} showMoreLabel={t('showMore')} />
            </div>
            {data.insights.inconsistentSSL && data.insights.inconsistentSSL.length > 0 && (
              <div className="card">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <ShieldAlert className="h-5 w-5 text-orange-600" />
                  {t('insights.inconsistentSSL')}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">{t('insights.inconsistentSSLDesc')}</p>
                <ol className="space-y-2">
                  {data.insights.inconsistentSSL.map((d) => (
                    <li key={d.domain} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                      <Link href={`/${locale}/domain/${encodeURIComponent(d.domain)}`} className="font-mono text-sm hover:text-primary hover:underline">
                        {d.domain}
                      </Link>
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        {d.issue}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Recently Registered Domains (WHOIS) */}
          <div className="card">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <CalendarPlus className="h-5 w-5 text-emerald-600" />
              {t('insights.recentlyRegistered')}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">{t('insights.recentlyRegisteredDesc', { count: data.insights.recentlyRegistered?.length ?? 0 })}</p>
            {data.insights.recentlyRegistered && data.insights.recentlyRegistered.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('table.domain')}</th>
                      <th>{t('table.organization')}</th>
                      <th>{t('table.registered')}</th>
                      <th>{t('table.ago')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.insights.recentlyRegistered.slice(0, visibleRegistered).map((d) => (
                      <tr key={d.domain}>
                        <td>
                          <Link href={`/${locale}/domain/${encodeURIComponent(d.domain)}`} className="font-mono text-sm hover:text-primary hover:underline">
                            {d.domain}
                          </Link>
                        </td>
                        <td className="text-sm text-muted-foreground">{d.org || '-'}</td>
                        <td className="text-sm">{formatDate(d.registeredDate, locale)}</td>
                        <td>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {formatTimeAgo(d.registeredDate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.insights.recentlyRegistered.length > visibleRegistered && (
                  <button
                    onClick={() => setVisibleRegistered((prev) => prev + 10)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <ChevronDown className="h-4 w-4" />
                    {t('showMore')} ({data.insights.recentlyRegistered.length - visibleRegistered})
                  </button>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-muted-foreground">{t('noRecentDomains')}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="card py-12 text-center">
          <p className="text-muted-foreground">{t('errorLoading')}</p>
        </div>
      )}
    </div>
  );
}
