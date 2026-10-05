'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CATEGORY_STYLE } from '@/lib/categories';
import type { Category } from '@/lib/checks';

type Props = {
  category: Category;
  intermittent?: boolean;
  className?: string;
};

export function CategoryBadge({ category, intermittent, className }: Props) {
  const t = useTranslations('categories');

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className={cn('badge', CATEGORY_STYLE[category].badge)} title={t(`${category}.description`)}>
        {t(`${category}.one`)}
      </span>
      {intermittent && (
        <span className="badge badge-intermittent" title={t('intermittent.description')}>
          {t('intermittent.one')}
        </span>
      )}
    </span>
  );
}
