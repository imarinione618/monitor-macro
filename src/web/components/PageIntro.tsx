import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-intro">
      <h1>{title}</h1>
      {children && <div className="page-lead">{children}</div>}
    </div>
  );
}

export function Unavailable({ items, title = 'No disponible en la API del INDEC' }: { items: string[]; title?: string }) {
  if (!items.length) return null;
  return (
    <aside className="unavailable">
      <h2>{title}</h2>
      <ul>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p className="muted small">
        Detalle en <Link href="/fuentes#no-disponibles">Fuentes y estado</Link>.
      </p>
    </aside>
  );
}
