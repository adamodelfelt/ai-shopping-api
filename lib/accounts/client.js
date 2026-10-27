import { HttpError } from '../http.js';

export function accountConfig(env = process.env) {
  if (env.ACCOUNT_AUTH_READY !== 'true' || !env.ACCOUNT_SUPABASE_URL || !env.ACCOUNT_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) return null;
  try {
    const url = new URL(env.ACCOUNT_SUPABASE_URL);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.pathname !== '/' || url.port) return null;
    return { url, key: env.ACCOUNT_SUPABASE_PUBLISHABLE_KEY };
  } catch { return null; }
}
export function createAccountClient(config, fetchImpl = fetch) {
  return async function request(path, { method = 'GET', body, token, prefer } = {}) {
    const url = new URL(path, config.url);
    if (url.origin !== config.url.origin || !['/auth/v1/otp', '/auth/v1/verify', '/auth/v1/user', '/auth/v1/token', '/auth/v1/logout', '/rest/v1/account_profiles', '/rest/v1/account_favorites'].includes(url.pathname)) throw new HttpError(503, 'Kontotjänsten är tillfälligt otillgänglig.');
    const headers = { apikey: config.key, 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (prefer) headers.Prefer = prefer;
    const response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new HttpError(401, 'Logga in igen för att fortsätta.');
      if (response.status === 429) throw new HttpError(429, 'För många försök. Vänta en stund och försök igen.');
      if (response.status === 400 && url.pathname === '/auth/v1/verify') throw new HttpError(400, 'Koden är felaktig eller har gått ut.');
      throw new HttpError(503, 'Kontotjänsten är tillfälligt otillgänglig.');
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return null;
    const text = await response.text();
    if (text.length > 65_536) throw new HttpError(503, 'Kontotjänsten är tillfälligt otillgänglig.');
    try { return text ? JSON.parse(text) : null; } catch { throw new HttpError(503, 'Kontotjänsten är tillfälligt otillgänglig.'); }
  };
}
