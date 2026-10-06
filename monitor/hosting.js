/**
 * IP -> network (ASN) lookup using Team Cymru's public DNS service.
 * https://www.team-cymru.com/ip-asn-mapping
 *
 *   4.3.2.1.origin.asn.cymru.com  TXT "ASN | prefix | CC | registry | date"
 *   AS1234.asn.cymru.com          TXT "ASN | CC | registry | date | AS name"
 *
 * Lookups are cached per run; failures return null and never break a check.
 */

const dns = require('dns').promises;

const LOOKUP_TIMEOUT_MS = 5000;
const ipCache = new Map();
const asnNameCache = new Map();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

async function txt(name) {
  const records = await withTimeout(dns.resolveTxt(name), LOOKUP_TIMEOUT_MS);
  return records.map(parts => parts.join('')).filter(Boolean);
}

async function lookupAsnName(asn) {
  if (asnNameCache.has(asn)) return asnNameCache.get(asn);
  const promise = txt(`AS${asn}.asn.cymru.com`)
    .then((records) => {
      const fields = (records[0] || '').split('|').map(s => s.trim());
      // "AS name, CC" -> keep the descriptive part
      return (fields[4] || '')
        .replace(/,\s*[A-Z]{2}$/, '')
        .replace(/^AS\d+\s*-\s*/, '') || null;
    })
    .catch(() => null);
  asnNameCache.set(asn, promise);
  return promise;
}

async function lookupIp(ip) {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
  if (ipCache.has(ip)) return ipCache.get(ip);

  const promise = (async () => {
    try {
      const reversed = ip.split('.').reverse().join('.');
      const records = await txt(`${reversed}.origin.asn.cymru.com`);
      if (records.length === 0) return null;
      // An IP can be announced by several ASNs; take the first one
      const fields = records[0].split('|').map(s => s.trim());
      const asn = parseInt(fields[0].split(' ')[0], 10);
      if (!Number.isFinite(asn)) return null;
      return {
        ip,
        asn,
        asName: await lookupAsnName(asn),
        country: fields[2] || null,
        prefix: fields[1] || null,
      };
    } catch (e) {
      return null;
    }
  })();

  ipCache.set(ip, promise);
  return promise;
}

/**
 * Adds `hosting` to every result whose DNS resolved to an IPv4 address.
 */
async function annotateHosting(results, concurrency = 20) {
  const targets = results.filter(r => r.reachability?.dns?.v4?.length > 0);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (index < targets.length) {
      const result = targets[index++];
      result.hosting = await lookupIp(result.reachability.dns.v4[0]);
    }
  });
  await Promise.all(workers);
  return targets.filter(r => r.hosting).length;
}

module.exports = { annotateHosting, lookupIp };
