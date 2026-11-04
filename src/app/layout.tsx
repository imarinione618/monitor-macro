import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Nav } from '@/web/components/Nav';
import { SyntheticBanner } from '@/web/components/StateMessages';
import { formatDateTimeAR } from '@/web/lib/format';
import { getStoreState } from '@/web/server/store';

// Sitio estático: se genera con los datos del store al momento del build (npm run build).
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: { default: 'Monitor macro Argentina — INDEC', template: '%s · Monitor macro Argentina' },
  description: 'Indicadores macroeconómicos de Argentina con datos oficiales del INDEC: actividad, mercado laboral, precios y comercio exterior.',
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
  const basePath = (process.env.SITE_BASE_PATH || '').replace(/\/+$/, '');
  return (
    <html lang="es-AR">
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
                <span className="brand-sub">Datos oficiales del INDEC</span>
              </p>
            </div>
            <p className="updated">
              {state.updatedAt ? (
                <>
                  Última actualización: <time dateTime={state.updatedAt}>{formatDateTimeAR(state.updatedAt)}</time>{' '}
                  <span className="muted">(hora de Buenos Aires)</span>
                </>
              ) : (
                <span className="muted">Sin actualización registrada</span>
              )}
            </p>
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
            Fuente: INDEC — Catálogo API-INDEC. Período de referencia ≠ fecha de publicación ≠ fecha de consulta. Las transformaciones (variaciones, acumulados,
            bases) son cálculos propios sobre los valores oficiales.
          </p>
        </footer>
      </body>
    </html>
  );
}
