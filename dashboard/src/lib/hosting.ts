/**
 * Who operates a domain's DNS, from the nameserver hostname.
 *   state    - government networks (gob.ve, REACCIUN, CANTV)
 *   national - Venezuelan companies (.ve hostnames and known local hosting providers)
 *   foreign  - everything else (Cloudflare, GoDaddy, free DNS services, ...)
 */

export type NameserverGroup = 'state' | 'national' | 'foreign';

const STATE_NS = /(\.gob\.ve|\.gov\.ve|\.mil\.ve|reacciun\.ve|cantv\.net|cantv\.com\.ve)\.?$/i;
const NATIONAL_PROVIDERS = /(tepuyserver\.net|daycohost\.com)\.?$/i;

export function groupNameserver(nameserver: string): NameserverGroup {
  const ns = nameserver.trim().toLowerCase();
  if (STATE_NS.test(ns)) return 'state';
  if (/\.ve\.?$/.test(ns) || NATIONAL_PROVIDERS.test(ns)) return 'national';
  return 'foreign';
}
