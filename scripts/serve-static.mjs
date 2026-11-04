/**
 * Servidor local mínimo (sin dependencias) para ver el sitio estático de out/.
 * Uso: npm start  (o: node scripts/serve-static.mjs --port 3000)
 * Respeta SITE_BASE_PATH si el build se hizo con una subruta.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('out');
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT || 3000);
const BASE = (process.env.SITE_BASE_PATH || '').replace(/\/+$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.map': 'application/json',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('No existe out/index.html. Generá el sitio primero con: npm run build');
  process.exit(1);
}

http
  .createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (BASE && url.startsWith(BASE)) url = url.slice(BASE.length) || '/';
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      const nf = path.join(ROOT, '404.html');
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'No encontrado');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Dashboard en http://localhost:${PORT}${BASE}/  (Ctrl+C para cerrar)`));
