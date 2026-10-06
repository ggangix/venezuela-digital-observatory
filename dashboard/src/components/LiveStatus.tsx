'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatRelativeTime, formatNumberWithSeparator, cn } from '@/lib/utils';

export type MonitoringInfo = {
  intervalHours: number;
  nextCheckAt: string;
  stale: boolean;
  totalChecks: number;
  discardedChecks: number;
  firstCheckAt: string | null;
  observations: number;
  eventsThisWeek: number;
};

type Props = {
  checkedAt: string;
  totalDomains: number;
  monitoring: MonitoringInfo;
};

function formatCompact(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'es' ? 'es-VE' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function LiveStatus({ checkedAt, totalDomains, monitoring }: Props) {
  const t = useTranslations('live');
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());

  // Keep "x minutes ago" and the progress bar moving while the page is open
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const last = new Date(checkedAt).getTime();
  const next = new Date(monitoring.nextCheckAt).getTime();
  const progress = Math.min(100, Math.max(0, ((now - last) / (next - last)) * 100));
  const overdue = now > next + 3600000;
  const historyDays = monitoring.firstCheckAt
    ? Math.floor((now - new Date(monitoring.firstCheckAt).getTime()) / 86400000)
    : 0;
  const nextTime = new Date(next).toLocaleTimeString(locale === 'es' ? 'es-VE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const counters = [
    {
      value: formatNumberWithSeparator(monitoring.totalChecks, locale),
      label: t('checks'),
      hint: monitoring.firstCheckAt ? t('since', { date: formatDate(monitoring.firstCheckAt, locale) }) : null,
    },
    { value: formatCompact(monitoring.observations, locale), label: t('observations') },
    { value: formatNumberWithSeparator(historyDays, locale), label: t('days') },
    {
      value: formatNumberWithSeparator(monitoring.eventsThisWeek, locale),
      label: t('changesWeek'),
      href: `/${locale}/changes`,
    },
  ];

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3 shrink-0">
            {!monitoring.stale && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            )}
            <span
              className={cn(
                'relative inline-flex h-3 w-3 rounded-full',
                monitoring.stale ? 'bg-amber-500' : 'bg-green-500'
              )}
            />
          </span>
          <div>
            <p className="text-sm font-medium">
              {t('verified', { time: formatRelativeTime(checkedAt, locale) })}
              <span className="text-muted-foreground"> · {overdue ? t('overdue') : t('next', { time: nextTime })}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t('every', {
                hours: monitoring.intervalHours,
                count: formatNumberWithSeparator(totalDomains, locale),
              })}
            </p>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:w-48">
          <div
            className="h-full rounded-full bg-green-500 transition-[width] duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4">
        {counters.map((c) => {
          const content = (
            <>
              {/* dt first for semantics; flex-col-reverse shows the value on top */}
              <dt className="stat-label text-xs">
                {c.label}
                {c.hint && <span className="block">{c.hint}</span>}
              </dt>
              <dd className="stat-value text-xl">{c.value}</dd>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="flex flex-col-reverse rounded-md hover:text-blue-600">
              {content}
            </Link>
          ) : (
            <div key={c.label} className="flex flex-col-reverse">
              {content}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
