'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Resumen' },
  { href: '/actividad', label: 'Actividad' },
  { href: '/laboral', label: 'Mercado laboral' },
  { href: '/precios', label: 'Precios' },
  { href: '/comercio', label: 'Comercio exterior' },
  { href: '/monetario', label: 'Monetario' },
  { href: '/fuentes', label: 'Fuentes y estado' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Secciones" className="nav">
      <ul>
        {LINKS.map((l) => {
          const active = l.href === '/' ? path === '/' : path?.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : undefined}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
