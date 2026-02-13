'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Shield, Server, Clock, AlertCircle, Globe, ChevronDown } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { SSLBadge } from '@/components/SSLBadge';
import { formatResponseTime, formatDateTime, formatDate, cn } from '@/lib/utils';

type DomainData = {
  domain: string;
  current: {
    status: 'online' | 'offline';
    httpCode: number | null;
    responseTime: number | null;
    error: string | null;
    reachability?: {
      dns?: {
        ok?: boolean;
        v4?: string[];
        v6?: string[];
        ips?: string[];
        error?: string | null;
        timeMs?: number | null;
      } | null;
      tcp?: {
        ok?: boolean;
        port?: number | null;
        timeMs?: number | null;
        error?: string | null;
      } | null;
    } | null;
    ssl: {
      enabled?: boolean;
      valid?: boolean;
      issuer?: string;
      subject?: string;
      validFrom?: string;
      validTo?: string;
      daysUntilExpiry?: number;
      selfSigned?: boolean;
    } | null;
    headers: {
      server?: string;
      poweredBy?: string;
      contentType?: string;
      cacheControl?: string;
    } | null;
    redirects: { url: string; statusCode: number }[] | null;
    finalUrl: string | null;
    checkedAt: string;
  };
  history: {
    checkedAt: string;
    status: 'online' | 'offline';
    httpCode: number | null;
    responseTime: number | null;
  }[];
  whois: {
    registrar: string | null;
    registeredDate: string | null;
    expireDate: string | null;
    org: string | null;
    nameservers: string[] | null;
  } | null;
};

export default function DomainDetailPage() {
  const params = useParams<{ name: string }>();
  const t = useTranslations('domain');
  const locale = useLocale();
  const domainName = decodeURIComponent(params.name);

  const [data, setData] = useState<DomainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [visibleHistory, setVisibleHistory] = useState(10);

  useEffect(() => {
    async function fetchDomain() {
      try {
        const res = await fetch(`/api/monitor/domains/${encodeURIComponent(domainName)}?history=50`);
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
      setLoading(false);
    }
    fetchDomain();
  }, [domainName]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link href={`/${locale}/domains`} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          {t('backToList')}
        </Link>
        <div className="card mt-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">{t('notFound')}</p>
        </div>
      </div>
    );
  }

  const { current } = data;
  const reachability = current.reachability || null;
  const dnsOk = reachability?.dns?.ok;
  const dnsIps = Array.isArray(reachability?.dns?.ips) ? reachability.dns.ips : [];
  const dnsStatus = dnsOk === true
    ? `${t('reachability.ok')} (${dnsIps.length})`
    : dnsOk === false
      ? t('reachability.fail')
      : t('common.notAvailable');
  const dnsError = reachability?.dns?.error || null;
  const tcpOk = reachability?.tcp?.ok;
  const tcpPort = reachability?.tcp?.port;
  const tcpTime: number | null = reachability?.tcp?.timeMs ?? null;
  const tcpError = reachability?.tcp?.error || null;
  const tcpStatus = tcpOk === true
    ? `${t('reachability.ok')} (${t('reachability.port')} ${tcpPort ?? '-'}, ${formatResponseTime(tcpTime)})`
    : tcpOk === false
      ? (tcpError === 'DNS_FAIL' ? t('reachability.skipped') : t('reachability.fail'))
      : t('common.notAvailable');
  const dnsIpsText = dnsIps.length > 0 ? dnsIps.join(', ') : t('common.notAvailable');

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link href={`/${locale}/domains`} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        {t('backToList')}
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-mono text-2xl md:text-3xl">{data.domain}</h1>
          <StatusBadge status={current.status} />
          <a
            href={`https://${data.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-4 w-4" />
            {t('visit')}
          </a>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('lastChecked')}: {formatDateTime(current.checkedAt, locale)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* WHOIS Information */}
        {data.whois && (
          <div className="card">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Globe className="h-5 w-5" />
              {t('sections.whois')}
            </h2>
            <dl className="grid gap-3">
              {data.whois.org && (
                <div>
                  <dt className="text-muted-foreground">{t('whois.organization')}</dt>
                  <dd className="text-sm font-medium">{data.whois.org}</dd>
                </div>
              )}
              {data.whois.registrar && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('whois.registrar')}</dt>
                  <dd className="text-sm">{data.whois.registrar}</dd>
                </div>
              )}
              {data.whois.registeredDate && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('whois.registered')}</dt>
                  <dd className="text-sm">{formatDate(data.whois.registeredDate, locale)}</dd>
                </div>
              )}
              {data.whois.expireDate && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('whois.expires')}</dt>
                  <dd className="text-sm">{formatDate(data.whois.expireDate, locale)}</dd>
                </div>
              )}
              {data.whois.nameservers && data.whois.nameservers.length > 0 && (
                <div>
                  <dt className="mb-1 text-muted-foreground">{t('whois.nameservers')}</dt>
                  <dd className="space-y-1">
                    {data.whois.nameservers.map((ns, i) => (
                      <div key={i} className="font-mono text-sm text-muted-foreground">{ns}</div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Current Status */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Clock className="h-5 w-5" />
            {t('sections.status')}
          </h2>
          <dl className="grid gap-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">HTTP Code</dt>
              <dd className="font-mono">{current.httpCode || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('responseTime')}</dt>
              <dd className="font-mono">{formatResponseTime(current.responseTime)}</dd>
            </div>
            {current.error && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Error</dt>
                <dd className="font-mono text-red-500">{current.error}</dd>
              </div>
            )}
            {current.finalUrl && current.finalUrl !== `https://${data.domain}` && (
              <div>
                <dt className="mb-1 text-muted-foreground">Final URL</dt>
                <dd className="break-all font-mono text-sm">{current.finalUrl}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Reachability */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Server className="h-5 w-5" />
            {t('sections.reachability')}
          </h2>
          {!reachability ? (
            <p className="text-muted-foreground">{t('reachability.unavailable')}</p>
          ) : (
            <dl className="grid gap-3">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('reachability.dns')}</dt>
                <dd className="font-mono">{dnsStatus}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('reachability.ips')}</dt>
                <dd className="text-sm font-mono">{dnsIpsText}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('reachability.tcp')}</dt>
                <dd className="font-mono">{tcpStatus}</dd>
              </div>
              {dnsError && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('reachability.dnsError')}</dt>
                  <dd className="font-mono text-red-500">{dnsError}</dd>
                </div>
              )}
              {tcpError && tcpError !== 'DNS_FAIL' && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('reachability.tcpError')}</dt>
                  <dd className="font-mono text-red-500">{tcpError}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* SSL Certificate */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Shield className="h-5 w-5" />
            {t('sections.ssl')}
          </h2>
          {current.ssl?.enabled ? (
            <dl className="grid gap-3">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('ssl.valid')}</dt>
                <dd><SSLBadge ssl={current.ssl} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('ssl.issuer')}</dt>
                <dd className="text-sm">{current.ssl.issuer || '-'}</dd>
              </div>
              {current.ssl.validTo && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('ssl.validTo')}</dt>
                  <dd className="text-sm">{formatDate(current.ssl.validTo, locale)}</dd>
                </div>
              )}
              {current.ssl.daysUntilExpiry !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('ssl.daysRemaining')}</dt>
                  <dd className={cn(
                    'font-mono',
                    current.ssl.daysUntilExpiry <= 30 && 'text-orange-500',
                    current.ssl.daysUntilExpiry <= 7 && 'text-red-500'
                  )}>
                    {current.ssl.daysUntilExpiry}
                  </dd>
                </div>
              )}
              {current.ssl.selfSigned && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('ssl.selfSigned')}</dt>
                  <dd className="text-yellow-600">Yes</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground">No SSL certificate detected</p>
          )}
        </div>

        {/* Server Headers */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Server className="h-5 w-5" />
            {t('sections.headers')}
          </h2>
          {current.headers ? (
            <dl className="grid gap-3">
              {current.headers.server && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('headers.server')}</dt>
                  <dd className="text-sm">{current.headers.server}</dd>
                </div>
              )}
              {current.headers.poweredBy && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('headers.poweredBy')}</dt>
                  <dd className="text-sm">{current.headers.poweredBy}</dd>
                </div>
              )}
              {current.headers.contentType && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('headers.contentType')}</dt>
                  <dd className="text-sm">{current.headers.contentType}</dd>
                </div>
              )}
              {current.headers.cacheControl && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('headers.cacheControl')}</dt>
                  <dd className="text-sm">{current.headers.cacheControl}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground">No headers captured</p>
          )}
        </div>

        {/* Redirects */}
        {current.redirects && current.redirects.length > 0 && (
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">{t('sections.redirects')}</h2>
            <ol className="space-y-2">
              {current.redirects.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{r.statusCode}</span>
                  <span className="break-all font-mono text-muted-foreground">{r.url}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

      </div>

      {/* History */}
      <div className="card mt-6">
        <h2 className="mb-4 text-lg font-semibold">{t('sections.history')}</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('historyTable.date')}</th>
                <th>{t('historyTable.status')}</th>
                <th>HTTP</th>
                <th>{t('historyTable.time')}</th>
              </tr>
            </thead>
            <tbody>
              {data.history.slice(0, visibleHistory).map((h, i) => (
                <tr key={i}>
                  <td className="text-sm">{formatDateTime(h.checkedAt, locale)}</td>
                  <td><StatusBadge status={h.status} /></td>
                  <td className="font-mono text-sm">{h.httpCode || '-'}</td>
                  <td className="font-mono text-sm">{formatResponseTime(h.responseTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.history.length > visibleHistory && (
          <button
            onClick={() => setVisibleHistory((prev) => prev + 10)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ChevronDown className="h-4 w-4" />
            {t('historyTable.showMore')} ({data.history.length - visibleHistory})
          </button>
        )}
      </div>
    </div>
  );
}
