'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { cn, formatNumberWithSeparator, percentage } from '@/lib/utils';
import { CATEGORY_STYLE } from '@/lib/categories';
import type { Category } from '@/lib/checks';

type Props = {
  totalDomains: number;
  active: number;
  failing: number;
  noDns: number;
};

export function CategorySummary({ totalDomains, active, failing, noDns }: Props) {
  const t = useTranslations('categories');
  const locale = useLocale();
  const withInfra = active + failing;

  const items: { category: Category; count: number }[] = [
    { category: 'active', count: active },
    { category: 'failing', count: failing },
    { category: 'no_dns', count: noDns },
  ];

  return (
    <div>
      <p className="mb-1 text-xl font-semibold sm:text-2xl">
        {t('withInfra', {
          active: formatNumberWithSeparator(active, locale),
          withInfra: formatNumberWithSeparator(withInfra, locale),
        })}
      </p>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('registered', {
          total: formatNumberWithSeparator(totalDomains, locale),
          noDns: formatNumberWithSeparator(noDns, locale),
        })}
      </p>

      {/* Proportion of every registered domain */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label={items.map((i) => `${t(`${i.category}.label`)}: ${i.count}`).join(', ')}>
        {items.map((i) => (
          <div
            key={i.category}
            className={CATEGORY_STYLE[i.category].bar}
            style={{ width: `${(i.count / Math.max(1, totalDomains)) * 100}%` }}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Link
            key={i.category}
            href={`/${locale}/domains?category=${i.category}`}
            className="card group flex flex-col gap-1 p-4 transition-colors hover:border-blue-300 dark:hover:border-blue-700"
          >
            <div className="flex items-center justify-between">
              <span className={cn('flex items-center gap-2 text-sm font-medium', CATEGORY_STYLE[i.category].text)}>
                <span className={cn('h-2.5 w-2.5 rounded-full', CATEGORY_STYLE[i.category].bar)} />
                {t(`${i.category}.label`)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="stat-value text-3xl">{formatNumberWithSeparator(i.count, locale)}</span>
              <span className="text-sm text-muted-foreground">{percentage(i.count, totalDomains)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t(`${i.category}.description`)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
