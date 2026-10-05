'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn, formatDateTime } from '@/lib/utils';
import { CATEGORY_STYLE } from '@/lib/categories';
import type { Category } from '@/lib/checks';

type Props = {
  strip: { checkedAt: string; category: Category; httpCode: number | null }[];
};

/** One bar per check, oldest on the left: the domain's recent history at a glance. */
export function StatusStrip({ strip }: Props) {
  const locale = useLocale();
  const t = useTranslations('categories');

  return (
    <div className="flex h-10 items-stretch gap-px" role="img" aria-label={`${strip.length} checks`}>
      {strip.map((s, i) => (
        <div
          key={i}
          className={cn('min-w-[2px] flex-1 rounded-sm', CATEGORY_STYLE[s.category].bar)}
          title={`${formatDateTime(s.checkedAt, locale)} · ${t(`${s.category}.one`)}${s.httpCode ? ` · HTTP ${s.httpCode}` : ''}`}
        />
      ))}
    </div>
  );
}
