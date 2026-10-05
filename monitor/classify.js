/**
 * Domain status categories.
 *
 *   active  - the site answered an HTTP(S) request
 *   failing - the domain resolves in DNS but the site does not answer
 *   no_dns  - the domain does not resolve (abandoned or broken delegation)
 *
 * Works on fresh results and on records already stored in MongoDB
 * (older records have no `category` field and may lack `reachability`).
 */

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

const CATEGORIES = ['active', 'failing', 'no_dns'];

function categorize(record) {
  if (!record) return 'no_dns';
  if (record.status === 'online') return 'active';

  const dnsOk = record.reachability?.dns?.ok;
  if (dnsOk === true) return 'failing';
  if (dnsOk === false) return 'no_dns';

  return DNS_ERROR_CODES.has(record.error) ? 'no_dns' : 'failing';
}

function countCategories(records) {
  const counts = { active: 0, failing: 0, noDns: 0 };
  for (const r of records) {
    const category = r.category || categorize(r);
    if (category === 'active') counts.active++;
    else if (category === 'failing') counts.failing++;
    else counts.noDns++;
  }
  return counts;
}

module.exports = { categorize, countCategories, CATEGORIES, DNS_ERROR_CODES };
