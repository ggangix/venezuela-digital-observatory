'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownCircle, ArrowUpCircle, PlusCircle, Server, ShieldX, ShieldCheck, RefreshCw } from 'lucide-react';
import { cn, formatDateTime, formatRelativeTime, formatSpan } from '@/lib/utils';
import { stateName } from '@/lib/classify';
import type { Category } from '@/lib/checks';

type Network = { asn?: number; asName?: string | null; country?: string | null };

export type MonitorEvent = {
  type: 'status' | 'new_domain' | 'hosting_change' | 'ssl_expired' | 'ssl_renewed';
  domain: string;
  at: string;
  from?: Category | Network;
  to?: Category | Network;
  previousSince?: string;
  previousSinceIsStart?: boolean;
  intermittent?: boolean;
  classification?: { level: string; state: string | null; sector: string };
};

type Props = {
  events: MonitorEvent[];
  /** Hide the domain name (used on a domain's own page) */
  hideDomain?: boolean;
};

function networkLabel(n?: Network) {
  if (!n) return '?';
  return `${n.asName || `AS${n.asn}`}${n.country ? ` (${n.country})` : ''}`;
}

export function EventList({ events, hideDomain }: Props) {
  const t = useTranslations('events');
  const tc = useTranslations('categories');
  const tl = useTranslations('levels');
  const locale = useLocale();

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>;
  }

  const describe = (e: MonitorEvent) => {
    switch (e.type) {
      case 'status': {
        if (e.to === 'active') {
          return { text: e.from === 'failing' || e.from === 'no_dns' ? t('up') : t('appeared'), icon: ArrowUpCircle, color: 'text-green-600 dark:text-green-400' };
        }
        if (e.from === 'active') {
          return { text: e.to === 'no_dns' ? t('downDns') : t('down'), icon: ArrowDownCircle, color: 'text-red-600 dark:text-red-400' };
        }
        return {
          text: t('transition', { from: tc(`${e.from as Category}.one`), to: tc(`${e.to as Category}.one`) }),
          icon: RefreshCw,
          color: 'text-slate-500',
        };
      }
      case 'new_domain':
        return { text: t('newDomain'), icon: PlusCircle, color: 'text-blue-600 dark:text-blue-400' };
      case 'hosting_change':
        return {
          text: t('hostingChange', { from: networkLabel(e.from as Network), to: networkLabel(e.to as Network) }),
          icon: Server,
          color: 'text-cyan-600 dark:text-cyan-400',
        };
      case 'ssl_expired':
        return { text: t('sslExpired'), icon: ShieldX, color: 'text-amber-600 dark:text-amber-400' };
      case 'ssl_renewed':
        return { text: t('sslRenewed'), icon: ShieldCheck, color: 'text-emerald-600 dark:text-emerald-400' };
    }
  };

  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
      {events.map((e, i) => {
        const d = describe(e);
        const state = stateName(e.classification?.state ?? null);
        const previousFor =
          e.type === 'status' && e.previousSince
            ? new Date(e.at).getTime() - new Date(e.previousSince).getTime()
            : null;
        return (
          <li key={`${e.domain}-${e.at}-${i}`} className="flex gap-3 py-3">
            <d.icon className={cn('mt-0.5 h-5 w-5 shrink-0', d.color)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {!hideDomain && (
                  <Link
                    href={`/${locale}/domain/${encodeURIComponent(e.domain)}`}
                    className="font-mono font-medium hover:text-blue-600 hover:underline"
                  >
                    {e.domain}
                  </Link>
                )}{' '}
                {d.text}
                {previousFor !== null && previousFor > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    {t(e.previousSinceIsStart ? 'wasForAtLeast' : 'wasFor', {
                      duration: formatSpan(previousFor, locale),
                      state: t(`prevState.${e.from as Category}`),
                    })}
                  </span>
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <time dateTime={e.at} title={formatDateTime(e.at, locale)}>
                  {formatRelativeTime(e.at, locale)}
                </time>
                {!hideDomain && e.classification && (
                  <span>
                    · {tl(e.classification.level)}
                    {state ? ` · ${state}` : ''}
                  </span>
                )}
                {e.intermittent && <span className="badge badge-intermittent">{tc('intermittent.one')}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
