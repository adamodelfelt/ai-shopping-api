import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { handler } from './lib/handler.js';
import { securityHeaders, json } from './lib/http.js';
import { readConfig } from './lib/catalogue.js';
import { accountHandler } from './lib/accounts/handler.js';

export function createApp() {
  return createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (['/api/search', '/api/similar', '/api/stock'].includes(pathname)) return handler(req, res, pathname.slice(5));
    if (pathname === '/api/account') return accountHandler(req, res);
    securityHeaders(res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return json(res, 405, { error: 'Metoden är inte tillåten.' }); }
    const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/state.js': ['state.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
    const extraAssets = { '/account.js': ['account.js', 'text/javascript; charset=utf-8'], '/profile.js': ['profile.js', 'text/javascript; charset=utf-8'], '/checkout.js': ['checkout.js', 'text/javascript; charset=utf-8'], '/checkout-model.js': ['checkout-model.js', 'text/javascript; charset=utf-8'] };
    const asset = assets[pathname] ?? extraAssets[pathname] ?? (['/availability.js', '/retailers.js', '/store-transfer.js', '/transfer-contract.js'].includes(pathname) ? [pathname.slice(1), 'text/javascript; charset=utf-8'] : pathname === '/whool-lindex-safari.zip' ? ['whool-lindex-safari.zip', 'application/zip'] : null);
    if (!asset) return json(res, 404, { error: 'Sidan finns inte.' });
    try {
      const content = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
      res.setHeader('Content-Type', asset[1]); res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : content);
    } catch { json(res, 500, { error: 'Sidan kunde inte laddas.' }); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  readConfig();
  if (process.env.NODE_ENV === 'production' && (!process.env.RATE_LIMIT_URL || !process.env.RATE_LIMIT_TOKEN || !process.env.PUBLIC_ORIGIN?.startsWith('https://'))) throw new Error('Production requires HTTPS PUBLIC_ORIGIN and distributed rate limiting');
  const app = createApp();
  app.requestTimeout = 15_000; app.headersTimeout = 10_000; app.keepAliveTimeout = 5000;
  const port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? '127.0.0.1';
  app.listen(port, host, () => console.log(`Whool: http://${host}:${port}`));
}
