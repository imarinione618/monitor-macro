import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Nav } from '@/web/components/Nav';
import { ThemeToggle } from '@/web/components/ThemeToggle';
import { SyntheticBanner } from '@/web/components/StateMessages';
import { formatDateTimeAR, formatShortDateTimeAR } from '@/web/lib/format';
import { getSourceFreshness } from '@/web/server/freshness';
import { getStoreState } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: { default: 'Monitor macro Argentina — INDEC y BCRA', template: '%s · Monitor macro Argentina' },
  description: 'Indicadores macroeconómicos de Argentina con datos oficiales del INDEC y BCRA: actividad, mercado laboral, precios, comercio exterior y monetario.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const state = getStoreState();
  const synthetic = state.dataMode === 'synthetic';
  const freshness = getSourceFreshness();
  const basePath = (process.env.SITE_BASE_PATH || '').replace(/\/+$/, '');
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('monitor-macro-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}" }} /></head>
      <body className={synthetic ? 'is-synthetic' : undefined}>
        <a href="#contenido" className="skip">
          Saltar al contenido
        </a>
        {synthetic && <SyntheticBanner />}
        <header className="site-header">
          <div className="wrap site-header-row">
            <div className="brand-block">
              <Link href="/" className="brand-logo" aria-label="one618 Asset Management — ir al resumen">
                <img src={`${basePath}/one618-logo-asset-management.svg`} alt="one618 Asset Management" width={227} height={67} />
              </Link>
              <p className="brand">
                <span className="brand-name">Monitor macro Argentina</span>
                <span className="brand-sub">Datos oficiales del INDEC y BCRA</span>
              </p>
            </div>
            <div className="header-actions"><ThemeToggle />
              {freshness.length ? (
                <div className="updated">
                  <span className="muted">Consultado por fuente (hora de Buenos Aires):</span>
                  <ul className="freshness">
                    {freshness.map((f) => (
                      <li key={f.key} className={f.ok ? undefined : 'warn-text'} title={f.ok ? `Última consulta exitosa: ${formatDateTimeAR(f.updatedAt)}` : `Falló la última consulta (${f.failed.length} de ${f.total}); se muestran datos de la consulta exitosa anterior.`}>
                        {f.label} <time dateTime={f.updatedAt ?? undefined}>{formatShortDateTimeAR(f.updatedAt)}</time>
                        {!f.ok && <> <span aria-hidden="true">⚠</span><span className="sr-only"> (falló la última consulta; datos anteriores)</span></>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="updated"><span className="muted">Sin actualización registrada</span></p>
              )}
            </div>
          </div>
          <div className="wrap">
            <Nav />
          </div>
        </header>
        <main id="contenido" className="wrap main">
          {children}
        </main>
        <footer className="site-footer wrap">
          <p>
            Fuentes: INDEC — Catálogo API-INDEC; BCRA — Estadísticas monetarias API v4. Período de referencia ≠ fecha de publicación ≠ fecha de consulta. Las transformaciones (variaciones, acumulados,
            bases) son cálculos propios sobre los valores oficiales.
          </p>
        </footer>
      </body>
    </html>
  );
}
