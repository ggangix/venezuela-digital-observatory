'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CategoryBadge } from '@/components/CategoryBadge';
import { SSLBadge } from '@/components/SSLBadge';
import { cn, formatResponseTime, formatRelativeTime, formatDate, formatNumberWithSeparator } from '@/lib/utils';
import { VE_STATES, stateName } from '@/lib/classify';
import { CATEGORY_STYLE } from '@/lib/categories';
import type { Category } from '@/lib/checks';

type CategoryFilter = 'all' | Category | 'intermittent';
type LevelFilter = 'all' | 'national' | 'state' | 'municipal' | 'military';
type SslFilter = 'all' | 'valid' | 'invalid' | 'none';
type HttpFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'error';
const CATEGORY_FILTERS: CategoryFilter[] = ['all', 'active', 'failing', 'no_dns', 'intermittent'];
const LEVEL_FILTERS: LevelFilter[] = ['all', 'national', 'state', 'municipal', 'military'];
type SortOption = 'status' | 'registered-desc' | 'registered-asc' | 'domain';
const SORT_OPTIONS: Record<SortOption, { sort: string; order: string }> = {
  status: { sort: 'status', order: 'asc' },
  'registered-desc': { sort: 'registered', order: 'desc' },
  'registered-asc': { sort: 'registered', order: 'asc' },
  domain: { sort: 'domain', order: 'asc' },
};
const FIRST_YEAR = 1997;
const YEARS = Array.from({ length: new Date().getFullYear() - FIRST_YEAR + 1 }, (_, i) => new Date().getFullYear() - i);

type Domain = {
  domain: string;
  category: Category;
  intermittent: boolean;
  since: string | null;
  sinceStart: boolean;
  registeredDate: string | null;
  status: 'online' | 'offline';
  httpCode: number | null;
  responseTime: number | null;
  ssl: {
    enabled?: boolean;
    valid?: boolean;
    daysUntilExpiry?: number;
  } | null;
  checkedAt: string;
};

type DomainsResponse = {
  domains: Domain[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categoryCounts: Record<CategoryFilter, number>;
};

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="input text-sm font-normal text-foreground">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function DomainsPage() {
  const t = useTranslations('domains');
  const tx = useTranslations('domainsExtra');
  const tc = useTranslations('categories');
  const tl = useTranslations('levels');
  const locale = useLocale();

  const [data, setData] = useState<DomainsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [stateId, setStateId] = useState('');
  const [year, setYear] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('status');
  const [ssl, setSsl] = useState<SslFilter>('all');
  const [httpCode, setHttpCode] = useState<HttpFilter>('all');
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters can come from links (e.g. /domains?category=failing or ?year=2005)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('category') as CategoryFilter | null;
    const l = params.get('level') as LevelFilter | null;
    const st = params.get('state');
    const y = params.get('year');
    if (c && CATEGORY_FILTERS.includes(c)) setCategory(c);
    if (l && LEVEL_FILTERS.includes(l)) setLevel(l);
    if (st && VE_STATES.some((s) => s.id === st)) setStateId(st);
    if (y && YEARS.includes(Number(y))) {
      setYear(y);
      setSortOption('registered-desc');
    }
    setReady(true);
  }, []);

  const fetchDomains = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        category,
        level,
        ...(stateId && { state: stateId }),
        ...(year && { year }),
        ...SORT_OPTIONS[sortOption],
        ssl,
        httpCode,
        ...(search && { search }),
      });

      const res = await fetch(`/api/monitor/domains?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    }
    setLoading(false);
  }, [ready, page, category, level, stateId, year, sortOption, ssl, httpCode, search]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [category, level, stateId, year, sortOption, ssl, httpCode, search]);

  // Secondary filters, shown as removable chips when active
  const activeFilters = [
    level !== 'all' && { key: 'level', label: `${tx('level')}: ${tl(level)}`, clear: () => setLevel('all') },
    stateId && { key: 'state', label: `${tx('state')}: ${stateName(stateId)}`, clear: () => setStateId('') },
    year && { key: 'year', label: `${tx('registeredYear')}: ${year}`, clear: () => setYear('') },
    ssl !== 'all' && {
      key: 'ssl',
      label: `SSL: ${t(`filters.${ssl === 'valid' ? 'sslValid' : ssl === 'invalid' ? 'sslInvalid' : 'noSSL'}`)}`,
      clear: () => setSsl('all'),
    },
    httpCode !== 'all' && {
      key: 'http',
      label: `HTTP: ${t(`filters.${httpCode === 'error' ? 'httpError' : `http${httpCode}`}`)}`,
      clear: () => setHttpCode('all'),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAll = () => {
    setLevel('all');
    setStateId('');
    setYear('');
    setSsl('all');
    setHttpCode('all');
  };

  const counts = data?.categoryCounts;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Search, sort and the toggle for secondary filters */}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          className="input w-auto"
          aria-label={tx('sortBy')}
        >
          {(Object.keys(SORT_OPTIONS) as SortOption[]).map((o) => (
            <option key={o} value={o}>
              {tx(`sort.${o}`)}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters || activeFilters.length > 0}
          className={cn('btn-outline gap-2', (showFilters || activeFilters.length > 0) && 'border-blue-500')}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {tx('filters')}
          {activeFilters.length > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 text-xs text-white">{activeFilters.length}</span>
          )}
        </button>
      </div>

      {/* Availability tabs with counts */}
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {CATEGORY_FILTERS.map((c) => {
          const selected = category === c;
          return (
            <button
              key={c}
              role="tab"
              aria-selected={selected}
              onClick={() => setCategory(c)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors',
                selected
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
              )}
            >
              {c !== 'all' && c !== 'intermittent' && (
                <span className={cn('h-2 w-2 rounded-full', CATEGORY_STYLE[c].bar)} />
              )}
              {c === 'intermittent' && <span className="h-2 w-2 rounded-full bg-violet-500" />}
              {c === 'all' ? t('filters.all') : tc(`${c}.label`)}
              {counts && (
                <span className={cn('tabular-nums text-xs', selected ? 'text-blue-100' : 'text-muted-foreground')}>
                  {formatNumberWithSeparator(counts[c], locale)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Secondary filters */}
      {showFilters && (
        <div className="card mb-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label={tx('level')}
            value={level}
            onChange={setLevel}
            options={LEVEL_FILTERS.map((l) => ({ value: l, label: l === 'all' ? t('filters.all') : tl(l) }))}
          />
          <FilterSelect
            label={tx('state')}
            value={stateId}
            onChange={setStateId}
            options={[{ value: '', label: t('filters.all') }, ...VE_STATES.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <FilterSelect
            label={tx('registeredYear')}
            value={year}
            onChange={setYear}
            options={[{ value: '', label: t('filters.all') }, ...YEARS.map((y) => ({ value: String(y), label: String(y) }))]}
          />
          <FilterSelect
            label="SSL"
            value={ssl}
            onChange={setSsl}
            options={[
              { value: 'all', label: t('filters.all') },
              { value: 'valid', label: t('filters.sslValid') },
              { value: 'invalid', label: t('filters.sslInvalid') },
              { value: 'none', label: t('filters.noSSL') },
            ]}
          />
          <FilterSelect
            label="HTTP"
            value={httpCode}
            onChange={setHttpCode}
            options={[
              { value: 'all', label: t('filters.all') },
              { value: '2xx', label: t('filters.http2xx') },
              { value: '3xx', label: t('filters.http3xx') },
              { value: '4xx', label: t('filters.http4xx') },
              { value: '5xx', label: t('filters.http5xx') },
              { value: 'error', label: t('filters.httpError') },
            ]}
          />
        </div>
      )}

      {/* Active filters as removable chips */}
      {activeFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={f.clear}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            >
              {f.label}
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button onClick={clearAll} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            {tx('clearFilters')}
          </button>
        </div>
      )}

      {/* Results count */}
      {data && (
        <p className="mb-4 text-sm text-muted-foreground">
          {data.total.toLocaleString(locale === 'es' ? 'de-DE' : 'en-US')} {t('resultsCount')}
          {category !== 'all' && <> · {tc(`${category}.description`)}</>}
        </p>
      )}

      {/* Table */}
      {loading && !data ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      ) : data && data.domains.length > 0 ? (
        <div className={cn('transition-opacity', loading && 'opacity-60')}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('columns.domain')}</th>
                  <th>{t('columns.status')}</th>
                  <th className="hidden md:table-cell">{t('columns.httpCode')}</th>
                  <th className="hidden md:table-cell">{t('columns.responseTime')}</th>
                  <th>{t('columns.ssl')}</th>
                  <th className="hidden lg:table-cell">{tx('since')}</th>
                  <th className="hidden sm:table-cell">{tx('registered')}</th>
                  <th className="hidden xl:table-cell">{t('columns.lastCheck')}</th>
                </tr>
              </thead>
              <tbody>
                {data.domains.map((domain) => (
                  <tr key={domain.domain}>
                    <td>
                      <Link
                        href={`/${locale}/domain/${encodeURIComponent(domain.domain)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {domain.domain}
                      </Link>
                    </td>
                    <td>
                      <CategoryBadge category={domain.category} intermittent={domain.intermittent} />
                    </td>
                    <td className="hidden font-mono text-sm md:table-cell">{domain.httpCode || '-'}</td>
                    <td className="hidden font-mono text-sm md:table-cell">{formatResponseTime(domain.responseTime)}</td>
                    <td>
                      <SSLBadge ssl={domain.ssl} />
                    </td>
                    <td className="hidden text-sm text-muted-foreground lg:table-cell">
                      {domain.sinceStart ? tx('sinceStart') : domain.since ? formatRelativeTime(domain.since, locale) : '-'}
                    </td>
                    <td className="hidden text-sm text-muted-foreground sm:table-cell">
                      {domain.registeredDate ? formatDate(domain.registeredDate, locale) : '-'}
                    </td>
                    <td className="hidden text-sm text-muted-foreground xl:table-cell">
                      {formatRelativeTime(domain.checkedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-4 text-sm">
                {page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="btn-outline"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{t('noResults')}</p>
        </div>
      )}
    </div>
  );
}
