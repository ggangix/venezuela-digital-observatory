'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { stateName } from '@/lib/classify';
import type { Category } from '@/lib/checks';
import { RawJsonPanel, RawJsonToggle } from '@/components/RawJson';

export type ObservingItem = {
  domain: string;
  from: Category;
  to: Category;
  since: string;
  checks: number;
  intermittent?: boolean;
  classification?: { level: string; state: string | null };
};

/** Changes seen in the latest checks that are not confirmed yet (< 24h). */
export function ObservingList({ items, showRaw }: { items: ObservingItem[]; showRaw?: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const t = useTranslations('observing');
  const tc = useTranslations('categories');
  const tl = useTranslations('levels');
  const locale = useLocale();

  const describe = (o: ObservingItem) => {
    const date = formatDateTime(o.since, locale);
    if (o.to === 'active') return t('up', { date });
    if (o.from === 'active') return o.to === 'no_dns' ? t('downDns', { date }) : t('down', { date });
    return t('transition', { from: tc(`${o.from}.one`), to: tc(`${o.to}.one`), date });
  };

  return (
    <ul className="divide-y divide-amber-100 dark:divide-amber-900/40">
      {items.map((o) => {
        const state = stateName(o.classification?.state ?? null);
        return (
          <li key={o.domain} className="flex gap-3 py-2.5">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <Link
                  href={`/${locale}/domain/${encodeURIComponent(o.domain)}`}
                  className="font-mono font-medium hover:text-blue-600 hover:underline"
                >
                  {o.domain}
                </Link>{' '}
                {describe(o)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('checks', { count: o.checks })}
                {o.classification && (
                  <>
                    {' · '}
                    {tl(o.classification.level)}
                    {state ? ` · ${state}` : ''}
                  </>
                )}
              </p>
              {showRaw && openKey === o.domain && (
                <RawJsonPanel value={o} apiHref={`/api/monitor/domains/${encodeURIComponent(o.domain)}`} />
              )}
            </div>
            {showRaw && (
              <RawJsonToggle open={openKey === o.domain} onToggle={() => setOpenKey(openKey === o.domain ? null : o.domain)} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
