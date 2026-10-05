// Rendered on request (MONGO_URI is not available at build time), cached by clients/CDN
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://venezueladigitalobservatory.com';

const CATEGORY_ES: Record<string, string> = {
  active: 'activo',
  failing: 'con fallas (no responde)',
  no_dns: 'sin DNS',
};

type FeedEvent = {
  type: string;
  domain: string;
  at: Date;
  from?: string | { asName?: string; country?: string };
  to?: string | { asName?: string; country?: string };
};

function describe(e: FeedEvent): string {
  switch (e.type) {
    case 'status':
      if (e.to === 'active') return `${e.domain} volvió a estar en línea`;
      if (e.from === 'active' && e.to === 'no_dns') return `${e.domain} dejó de resolver en DNS`;
      if (e.from === 'active') return `${e.domain} dejó de responder`;
      return `${e.domain} pasó de ${CATEGORY_ES[e.from as string]} a ${CATEGORY_ES[e.to as string]}`;
    case 'new_domain':
      return `Nuevo dominio monitoreado: ${e.domain}`;
    case 'hosting_change': {
      const to = e.to as { asName?: string; country?: string };
      return `${e.domain} cambió de proveedor de alojamiento a ${to?.asName ?? 'otro proveedor'}${to?.country ? ` (${to.country})` : ''}`;
    }
    case 'ssl_expired':
      return `Venció el certificado SSL de ${e.domain}`;
    default:
      return e.domain;
  }
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET() {
  const { getMonitorCollection } = await import('@/lib/mongodb');
  const { events } = await getMonitorCollection();
  const items = (await events
    .find({ type: { $in: ['status', 'new_domain', 'hosting_change', 'ssl_expired'] }, intermittent: { $ne: true } })
    .sort({ at: -1 })
    .limit(100)
    .project({ _id: 1, type: 1, domain: 1, at: 1, from: 1, to: 1 })
    .toArray()) as (FeedEvent & { _id: unknown })[];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Observatorio Digital de Venezuela — Cambios</title>
  <link>${BASE_URL}/es/changes</link>
  <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
  <description>Sitios del gobierno venezolano que se caen, vuelven, cambian de alojamiento o aparecen. Verificado cada 6 horas.</description>
  <language>es-VE</language>
${items
  .map((e) => {
    const title = escape(describe(e));
    const link = `${BASE_URL}/es/domain/${encodeURIComponent(e.domain)}`;
    return `  <item>
    <title>${title}</title>
    <link>${link}</link>
    <guid isPermaLink="false">${String(e._id)}</guid>
    <pubDate>${new Date(e.at).toUTCString()}</pubDate>
    <description>${title}. Detectado por el monitoreo automático del Observatorio Digital de Venezuela.</description>
  </item>`;
  })
  .join('\n')}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}
