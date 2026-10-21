import { readFile } from 'fs/promises';
import { join } from 'path';
import { ImageResponse } from 'next/og';
import { getMonitorCollection } from '@/lib/mongodb';
import { getLatestValidCheck, CATEGORY_EXPR } from '@/lib/checks';

export const alt = 'Observatorio Digital de Venezuela: qué webs del Estado funcionan y cuáles no';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

async function authorPhoto(): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public/imagenes/giuseppe.jpg'));
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function stats() {
  try {
    const { checks, domains } = await getMonitorCollection();
    const latest = await getLatestValidCheck(checks);
    if (!latest) throw new Error('no check');
    const s = latest.summary || {};
    let { active, failing, noDns } = s as { active?: number; failing?: number; noDns?: number };
    if (active === undefined) {
      const counts = await domains
        .aggregate([{ $match: { checkId: latest._id } }, { $group: { _id: CATEGORY_EXPR, n: { $sum: 1 } } }])
        .toArray();
      const by = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      active = by.active || 0;
      failing = by.failing || 0;
      noDns = by.no_dns || 0;
    }
    return {
      total: s.totalDomains || active! + failing! + noDns!,
      active: active!,
      failing: failing!,
      noDns: noDns!,
    };
  } catch {
    return { total: 2559, active: 381, failing: 160, noDns: 2018 };
  }
}

export default async function Image() {
  const [d, autor] = await Promise.all([stats(), authorPhoto()]);
  const fmt = (n: number) => n.toLocaleString('es-VE');
  const cifras: [string, string, string][] = [
    [fmt(d.total), 'dominios .gob.ve y .mil.ve', '#e2e8f0'],
    [fmt(d.active), 'activos', '#22c55e'],
    [fmt(d.failing), 'con fallas', '#f59e0b'],
    [fmt(d.noDns), 'sin DNS', '#94a3b8'],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0b1220 0%, #1e293b 60%, #312e81 100%)',
          color: 'white',
          padding: 56,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
            <div style={{ fontSize: 22, letterSpacing: 2, color: '#fbbf24', fontWeight: 700 }}>
              MONITOREO CIUDADANO · VENEZUELA
            </div>
            <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.05, marginTop: 12 }}>
              Observatorio Digital de Venezuela
            </div>
            <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 14 }}>
              Qué webs del Estado funcionan, cuáles se caen y cómo están montadas. Verificado cada 6 horas.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 16px 8px 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {autor && (
              <img
                src={autor}
                width={48}
                height={48}
                style={{ borderRadius: 999, marginRight: 12, border: '2px solid rgba(255,255,255,0.3)' }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>Por Giuseppe Gangi</span>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)' }}>venezueladigitalobservatory.com</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          {cifras.map(([n, label, color]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginRight: 20,
                padding: '14px 24px',
                borderRadius: 16,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                width: 258,
              }}
            >
              <span style={{ fontSize: 46, fontWeight: 800, color }}>{n}</span>
              <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
