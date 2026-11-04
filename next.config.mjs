/**
 * El dashboard se publica como SITIO ESTÁTICO (HTML/JS/CSS en out/), generado con los
 * datos de data/store al momento del build. Se puede servir con GitHub Pages o con
 * cualquier servidor de archivos (`npm start` usa scripts/serve-static.mjs).
 *
 * SITE_BASE_PATH: subruta donde se publica (en GitHub Pages de proyecto, "/<repo>").
 * Vacío para servir en la raíz (local).
 *
 * Seguridad: solo variables explícitamente públicas llegan al navegador. El token de
 * INDEC y las credenciales de Google NUNCA usan el prefijo NEXT_PUBLIC_.
 */
const basePath = (process.env.SITE_BASE_PATH || '').replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true, // /actividad/ -> actividad/index.html (compatible con GitHub Pages)
  basePath: basePath || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
