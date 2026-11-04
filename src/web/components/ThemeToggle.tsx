'use client';

import { useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'monitor-macro-theme';

export function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && media.matches));
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', update);
    update();
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);
  return dark;
}

export function ThemeToggle() {
  const dark = useDarkMode();
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      if (event.newValue === 'dark' || event.newValue === 'light') document.documentElement.dataset.theme = event.newValue;
      else delete document.documentElement.dataset.theme;
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <button type="button" className="btn theme-toggle" aria-label="Modo oscuro" aria-pressed={dark} onClick={() => {
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* La selección sigue funcionando sin almacenamiento. */ }
  }}><span aria-hidden="true">{dark ? '☀' : '☾'}</span> {dark ? 'Modo claro' : 'Modo oscuro'}</button>;
}
