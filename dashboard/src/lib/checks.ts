import type { Collection, Document } from 'mongodb';

/**
 * Checks the monitor flagged as invalid (it lost connectivity, e.g. VPN down)
 * are excluded everywhere. Older checks have no `valid` field and count as valid.
 */
export const VALID_CHECK_FILTER = { valid: { $ne: false } };

/** Domain records belonging to discarded checks. */
export const NOT_DISCARDED_FILTER = { discarded: { $ne: true } };

/** How often the monitor runs (entrypoint.sh CHECK_INTERVAL). */
export const CHECK_INTERVAL_HOURS = 6;

export async function getLatestValidCheck(checks: Collection<Document>) {
  return checks.findOne(VALID_CHECK_FILTER, { sort: { checkedAt: -1 } });
}

export type Category = 'active' | 'failing' | 'no_dns';

export const CATEGORIES: Category[] = ['active', 'failing', 'no_dns'];

const DNS_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ESERVFAIL',
  'ENODATA',
  'EREFUSED',
  'EAI_AGAIN',
  'DNS_TIMEOUT',
  'DNS_FAIL',
  'DNS_NO_RECORDS',
]);

/** Same rules as monitor/classify.js, for records stored before `category` existed. */
export function categorize(record: {
  category?: string | null;
  status?: string;
  error?: string | null;
  reachability?: { dns?: { ok?: boolean } } | null;
}): Category {
  if (record.category === 'active' || record.category === 'failing' || record.category === 'no_dns') {
    return record.category;
  }
  if (record.status === 'online') return 'active';
  const dnsOk = record.reachability?.dns?.ok;
  if (dnsOk === true) return 'failing';
  if (dnsOk === false) return 'no_dns';
  return record.error && DNS_ERROR_CODES.has(record.error) ? 'no_dns' : 'failing';
}

/** Mongo expression equivalent of categorize(), for aggregations. */
export const CATEGORY_EXPR = {
  $switch: {
    branches: [
      { case: { $in: ['$category', ['active', 'failing', 'no_dns']] }, then: '$category' },
      { case: { $eq: ['$status', 'online'] }, then: 'active' },
      { case: { $eq: ['$reachability.dns.ok', true] }, then: 'failing' },
      { case: { $eq: ['$reachability.dns.ok', false] }, then: 'no_dns' },
      { case: { $in: ['$error', Array.from(DNS_ERROR_CODES)] }, then: 'no_dns' },
    ],
    default: 'failing',
  },
};

export type CheckSummary = {
  totalDomains: number;
  online: number;
  offline: number;
  withSSL: number;
  validSSL: number;
  avgResponseTime: number;
  active?: number;
  failing?: number;
  noDns?: number;
};

/** Shape of a ve_monitor_domains record (fields are optional because of projections). */
export type DomainRecord = {
  domain: string;
  checkedAt: Date;
  status?: 'online' | 'offline';
  category?: Category | null;
  error?: string | null;
  httpCode?: number | null;
  responseTime?: number | null;
  reachability?: { dns?: { ok?: boolean } } | null;
  ssl?: { enabled?: boolean; valid?: boolean } | null;
  headers?: { server?: string | null; hsts?: string | null } | null;
  hosting?: { asn: number; asName?: string | null; country?: string | null } | null;
  finalUrl?: string | null;
};
