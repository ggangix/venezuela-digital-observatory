'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { SSLBadge } from '@/components/SSLBadge';
import { formatResponseTime, formatRelativeTime } from '@/lib/utils';

type Domain = {
  domain: string;
  status: 'online' | 'offline';
  httpCode: number | null;
  responseTime: number | null;
  ssl: {
    enabled?: boolean;
    valid?: boolean;
    daysUntilExpiry?: number;
  } | null;
  headers: {
    server?: string;
  } | null;
  checkedAt: string;
};

type DomainsResponse = {
  domains: Domain[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function DomainsPage() {
  const t = useTranslations('domains');
  const locale = useLocale();

  const [data, setData] = useState<DomainsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [ssl, setSsl] = useState<'all' | 'valid' | 'invalid' | 'none'>('all');
  const [httpCode, setHttpCode] = useState<'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'error'>('all');
  const [page, setPage] = useState(1);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        status,
        ssl,
        httpCode,
        ...(search && { search }),
      });

      const res = await fetch(`/api/monitor/domains?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    }
    setLoading(false);
  }, [page, status, ssl, httpCode, search]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [status, ssl, httpCode, search]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="input w-auto"
          >
            <option value="all">{t('filters.all')}</option>
            <option value="online">{t('filters.online')}</option>
            <option value="offline">{t('filters.offline')}</option>
          </select>
        </div>

        {/* SSL Filter */}
        <select
          value={ssl}
          onChange={(e) => setSsl(e.target.value as typeof ssl)}
          className="input w-auto"
        >
          <option value="all">{t('filters.all')} SSL</option>
          <option value="valid">{t('filters.sslValid')}</option>
          <option value="invalid">{t('filters.sslInvalid')}</option>
          <option value="none">{t('filters.noSSL')}</option>
        </select>

        {/* HTTP Code Filter */}
        <select
          value={httpCode}
          onChange={(e) => setHttpCode(e.target.value as typeof httpCode)}
          className="input w-auto"
        >
          <option value="all">{t('filters.all')} HTTP</option>
          <option value="2xx">{t('filters.http2xx')}</option>
          <option value="3xx">{t('filters.http3xx')}</option>
          <option value="4xx">{t('filters.http4xx')}</option>
          <option value="5xx">{t('filters.http5xx')}</option>
          <option value="error">{t('filters.httpError')}</option>
        </select>
      </div>

      {/* Results count */}
      {data && (
        <p className="mb-4 text-sm text-muted-foreground">
          {data.total.toLocaleString()} {t('resultsCount')}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      ) : data && data.domains.length > 0 ? (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('columns.domain')}</th>
                  <th>{t('columns.status')}</th>
                  <th>{t('columns.httpCode')}</th>
                  <th>{t('columns.responseTime')}</th>
                  <th>{t('columns.ssl')}</th>
                  <th className="hidden lg:table-cell">{t('columns.server')}</th>
                  <th className="hidden md:table-cell">{t('columns.lastCheck')}</th>
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
                      <StatusBadge status={domain.status} />
                    </td>
                    <td className="font-mono text-sm">
                      {domain.httpCode || '-'}
                    </td>
                    <td className="font-mono text-sm">
                      {formatResponseTime(domain.responseTime)}
                    </td>
                    <td>
                      <SSLBadge ssl={domain.ssl} />
                    </td>
                    <td className="hidden text-sm text-muted-foreground lg:table-cell">
                      {domain.headers?.server || '-'}
                    </td>
                    <td className="hidden text-sm text-muted-foreground md:table-cell">
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
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-outline"
              >
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
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{t('noResults')}</p>
        </div>
      )}
    </div>
  );
}
