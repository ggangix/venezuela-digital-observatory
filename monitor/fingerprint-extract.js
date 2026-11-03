/**
 * Extract signals from a site's homepage HTML. Pure function: no network, no DB,
 * so it can be unit-tested. The monitor's fingerprint pass feeds it the HTML it
 * downloaded and stores/compares the result.
 *
 * Covers observatory ideas #1-#4:
 *   #1 defacement: off-domain redirect + gambling/porn/pharma keywords
 *   #2 trackers:   who the site reports your visit to (Google, Meta, ...)
 *   #3 stack:      CMS / framework the site is built with
 *   #4 obsolete:   end-of-life libraries and tech still in use
 *
 * Every detection carries `evidence` (a short matched string) so a published
 * claim can always point to what it saw (idea #5).
 */

// --- #2 trackers: host or code signature -> label
const TRACKERS = [
  { id: 'google-analytics', label: 'Google Analytics', re: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/(ga|analytics)\.js|gtag\(|\bga\('create'|UA-\d{4,}-\d+|G-[A-Z0-9]{8,}/i },
  { id: 'google-tag-manager', label: 'Google Tag Manager', re: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{5,}/ },
  { id: 'meta-pixel', label: 'Meta (Facebook) Pixel', re: /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/i },
  { id: 'google-fonts', label: 'Google Fonts', re: /fonts\.googleapis\.com|fonts\.gstatic\.com/i },
  { id: 'google-maps', label: 'Google Maps', re: /maps\.googleapis\.com|maps\.google\.com\/maps/i },
  { id: 'youtube', label: 'YouTube', re: /youtube\.com\/embed|youtube-nocookie\.com/i },
  { id: 'recaptcha', label: 'Google reCAPTCHA', re: /google\.com\/recaptcha|gstatic\.com\/recaptcha/i },
  { id: 'hotjar', label: 'Hotjar', re: /static\.hotjar\.com|hjSetting/i },
  { id: 'cloudflare-insights', label: 'Cloudflare Insights', re: /static\.cloudflareinsights\.com/i },
];

// --- #3 CMS / stack
const CMS = [
  { id: 'wordpress', label: 'WordPress', re: /wp-content\/|wp-includes\/|<meta name="generator" content="WordPress/i },
  { id: 'drupal', label: 'Drupal', re: /\/sites\/(all|default)\/|Drupal\.settings|<meta name="generator" content="Drupal/i },
  { id: 'joomla', label: 'Joomla', re: /\/media\/jui\/|\/components\/com_|<meta name="generator" content="Joomla/i },
  { id: 'moodle', label: 'Moodle', re: /moodle|\/theme\/boost\//i },
  { id: 'liferay', label: 'Liferay', re: /liferay|\/o\/frontend-/i },
];

// --- #4 end-of-life / obsolete tech. `eol` = year it stopped being supported.
const OBSOLETE = [
  { id: 'jquery-1', label: 'jQuery 1.x', eol: 2016, re: /jquery[/-]1\.\d+(\.\d+)?(\.min)?\.js|jquery\.min\.js\?ver=1\./i },
  { id: 'jquery-2', label: 'jQuery 2.x', eol: 2016, re: /jquery[/-]2\.\d+(\.\d+)?(\.min)?\.js/i },
  { id: 'flash', label: 'Adobe Flash', eol: 2020, re: /\.swf(["'?]|$)|application\/x-shockwave-flash/i },
  { id: 'java-applet', label: 'Applets de Java', eol: 2018, re: /<applet[\s>]|type=["']application\/x-java-applet/i },
  { id: 'universal-analytics', label: 'Universal Analytics', eol: 2023, re: /UA-\d{4,}-\d+|google-analytics\.com\/analytics\.js/ },
  { id: 'prototype', label: 'Prototype.js', eol: 2015, re: /prototype(\.min)?\.js/i },
  { id: 'mootools', label: 'MooTools', eol: 2016, re: /mootools(-core)?(\.min)?\.js/i },
  { id: 'angularjs', label: 'AngularJS (1.x)', eol: 2022, re: /angular(\.min)?\.js|ng-app=/i },
  { id: 'ie-mode', label: 'Modo Internet Explorer', eol: 2022, re: /<meta[^>]+http-equiv=["']x-ua-compatible["'][^>]*IE=/i },
  { id: 'xhtml', label: 'XHTML 1', eol: 2018, re: /<!DOCTYPE[^>]+XHTML/i },
];

// --- #1 defacement: injected spam. Word-boundary to limit false positives.
const SPAM = [
  { id: 'gambling', label: 'apuestas / casino', re: /\b(casino|betting|apuestas|slot(s| gacor)|judi|togel|poker online|situs|bandar|sbobet|maxwin|gacor)\b/i },
  { id: 'adult', label: 'contenido adulto', re: /\b(porn|xxx|bokep|escort|sex cam|hentai)\b/i },
  { id: 'pharma', label: 'farmacia ilegal', re: /\b(viagra|cialis|tadalafil|pharmacy online|canadian pharmacy)\b/i },
];

function attr(html, re) {
  const m = html.match(re);
  return m ? (m[1] || m[0]) : null;
}

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return null; }
}

/**
 * @param {object} input
 * @param {string} input.domain     the monitored domain
 * @param {string} input.html       homepage HTML (first N KB)
 * @param {string|null} input.finalUrl  URL after redirects, if any
 * @returns {object} fingerprint
 */
function extract({ domain, html = '', finalUrl = null }) {
  // Only look at the visible-ish part for spam; scripts/trackers across whole doc
  const title = (attr(html, /<title[^>]*>([\s\S]{0,300}?)<\/title>/i) || '').replace(/\s+/g, ' ').trim();
  const generator = attr(html, /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);

  const trackers = TRACKERS.filter((t) => t.re.test(html)).map((t) => ({ id: t.id, label: t.label }));
  const cms = CMS.filter((c) => c.re.test(html)).map((c) => ({ id: c.id, label: c.label }));
  const obsolete = OBSOLETE.filter((o) => o.re.test(html)).map((o) => ({
    id: o.id,
    label: o.label,
    eol: o.eol,
    evidence: ((html.match(o.re) || [])[0] || '').slice(0, 80),
  }));

  // #1 defacement signals
  const flags = [];
  // off-domain redirect: final host is neither the domain nor any .gob/.gov/.mil.ve
  const fHost = finalUrl ? hostOf(finalUrl) : null;
  if (fHost && fHost !== domain && fHost !== `www.${domain}` && !/\.(gob|gov|mil)\.ve$/.test(fHost)) {
    flags.push({ id: 'offsite-redirect', label: 'redirige fuera de .gob.ve', evidence: finalUrl.slice(0, 120) });
  }
  // spam keywords in title or body
  for (const s of SPAM) {
    const m = (title + ' ' + html).match(s.re);
    if (m) flags.push({ id: `spam-${s.id}`, label: s.label, evidence: m[0].slice(0, 60) });
  }

  // distinct external script hosts (for #3 concentration / third parties)
  const scriptHosts = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    const h = hostOf(m[1].startsWith('//') ? 'https:' + m[1] : m[1]);
    if (h && h !== domain && h !== `www.${domain}`) scriptHosts.add(h);
  }

  return {
    title: title || null,
    generator: generator || null,
    trackers,
    cms,
    obsolete,
    flags,
    scriptHosts: [...scriptHosts].slice(0, 20),
    at: new Date(),
  };
}

module.exports = { extract, TRACKERS, CMS, OBSOLETE, SPAM };
