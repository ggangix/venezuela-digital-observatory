import type { Category } from '@/lib/checks';

/** Visual identity of each status category, shared by badges, cards and charts. */
export const CATEGORY_STYLE: Record<Category, { badge: string; text: string; bg: string; bar: string; chart: string }> = {
  active: {
    badge: 'badge-online',
    text: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/30',
    bar: 'bg-green-500',
    chart: '#22c55e',
  },
  failing: {
    badge: 'badge-failing',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    bar: 'bg-amber-400',
    chart: '#f59e0b',
  },
  no_dns: {
    badge: 'badge-nodns',
    text: 'text-slate-500 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800',
    bar: 'bg-slate-300 dark:bg-slate-600',
    chart: '#94a3b8',
  },
};
