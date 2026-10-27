import { createHash } from 'node:crypto';
import { isSnapshotPreview, deploymentOrigin } from './environment.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const MAX_BODY_BYTES = 16 * 1024;
export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://media.arket.com https://minirodini.centracdn.net https://www.polarnopyret.se https://polarnopyret.se https://static.kappahl.com https://i8.amplience.net https://images.tretorn.eu; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
export function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}
export async function boundedJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Använd application/json.');
  const length = Number(req.headers['content-length']);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, 'För stor förfrågan.');
  // Vercel may have parsed the request body already; apply the same byte cap.
  if (req.body !== undefined) {
    let serialized;
    try { serialized = typeof req.body === 'string' ? req.body : JSON.stringify(req.body); } catch { throw new HttpError(400, 'Ogiltig JSON.'); }
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new HttpError(413, 'För stor förfrågan.');
    try { return JSON.parse(serialized); } catch { throw new HttpError(400, 'Ogiltig JSON.'); }
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'För stor förfrågan.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Ogiltig JSON.'); }
}
export function objectBody(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowedKeys.includes(key))) throw new HttpError(400, 'Ogiltiga fält.');
}
export function searchBody(value) {
  objectBody(value, ['query', 'excludeProductIds', 'extendSearch', 'favoriteProductIds']);
  if (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 500 || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value.query)) throw new HttpError(400, 'Skriv en sökning på 1–500 tecken.');
  const ids = value.excludeProductIds ?? [];
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string' || !/^\d{1,18}$/.test(id))) throw new HttpError(400, 'Ogiltiga produktreferenser.');
  if (value.extendSearch !== undefined && typeof value.extendSearch !== 'boolean') throw new HttpError(400, 'Ogiltigt sökalternativ.');
  const favorites = value.favoriteProductIds ?? [];
  if (!Array.isArray(favorites) || favorites.length > 40 || favorites.some(id => typeof id !== 'string' || !/^\d{1,18}$/.test(id))) throw new HttpError(400, 'Ogiltiga favoritreferenser.');
  return { query: value.query.trim(), excludeProductIds: [...new Set(ids)], extendSearch: value.extendSearch === true, favoriteProductIds: [...new Set(favorites)] };
}
export function originAllowed(req, res, env = process.env) {
  const origin = req.headers.origin;
  if (!origin) return;
  const localOrigins = env.NODE_ENV === 'production' ? [] : [`http://localhost:${env.PORT ?? 3000}`, `http://127.0.0.1:${env.PORT ?? 3000}`];
  const allowed = new Set([env.PUBLIC_ORIGIN, deploymentOrigin(env), ...(env.ALLOWED_ORIGINS ?? '').split(','), ...localOrigins].filter(Boolean));
  if (!allowed.has(origin)) throw new HttpError(403, 'Denna källa är inte tillåten.');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
export function createLimiter({ limit = 30, period = 60_000, maxKeys = 5000, now = Date.now } = {}) {
  const clients = new Map();
  return key => {
    const time = now();
    for (const [client, bucket] of clients) if (bucket.reset <= time) clients.delete(client);
    const bucket = clients.get(key);
    if (bucket && bucket.count >= limit) return false;
    if (bucket) bucket.count++;
    else {
      if (clients.size >= maxKeys) return false;
      clients.set(key, { count: 1, reset: time + period });
    }
    return true;
  };
}
const memoryLimit = createLimiter();
export async function enforceLimit(req, res, env = process.env, fetchImpl = fetch) {
  const ip = env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  const key = createHash('sha256').update(String(ip ?? 'unknown')).digest('hex');
  let allowed;
  if (env.NODE_ENV === 'production' && !isSnapshotPreview(env)) {
    if (!env.RATE_LIMIT_URL || !env.RATE_LIMIT_TOKEN) throw new HttpError(503, 'Tjänsten är inte färdigkonfigurerad.');
    const url = new URL(env.RATE_LIMIT_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') || url.username || url.password) throw new HttpError(503, 'Tjänsten är inte färdigkonfigurerad.');
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${env.RATE_LIMIT_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(['EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n", '1', `whool:quota:${key}`, '60000']) });
    if (!response.ok) throw new HttpError(503, 'Sökningen är tillfälligt otillgänglig.');
    const result = await response.json();
    if (!Number.isInteger(result.result) || result.result < 1) throw new HttpError(503, 'Sökningen är tillfälligt otillgänglig.');
    allowed = result.result <= 30;
  } else allowed = memoryLimit(key);
  if (!allowed) { res.setHeader('Retry-After', '60'); throw new HttpError(429, 'För många sökningar. Försök igen om en minut.'); }
}
