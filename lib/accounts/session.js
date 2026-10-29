import { HttpError } from '../http.js';

function names(env) { const prefix = env.NODE_ENV === 'production' ? '__Secure-' : ''; return { access: `${prefix}whool_access`, refresh: `${prefix}whool_refresh` }; }
function cookies(req) {
  const result = new Map();
  for (const item of String(req.headers.cookie ?? '').split(';')) {
    const index = item.indexOf('='); if (index < 0) continue;
    const name = item.slice(0, index).trim(), value = item.slice(index + 1).trim();
    // Duplicate names fail closed rather than letting path-specific cookies shadow one another.
    if (result.has(name)) result.set(name, ''); else result.set(name, value);
  }
  return result;
}
function validToken(value) { return typeof value === 'string' && value.length > 0 && value.length <= 8192 && /^[A-Za-z0-9._~-]+$/.test(value); }
export function setSession(res, session, env) {
  if (!validToken(session?.access_token) || !validToken(session?.refresh_token) || !Number.isFinite(session?.expires_in)) throw new HttpError(503, 'Inloggningen kunde inte slutföras.');
  const keys = names(env), options = `; Path=/api/account; HttpOnly; SameSite=Strict${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', [
    `${keys.access}=${session.access_token}; Max-Age=${Math.min(3600, Math.max(1, Math.floor(session.expires_in)))}${options}`,
    `${keys.refresh}=${session.refresh_token}; Max-Age=1209600${options}`,
  ]);
}
export function clearSession(res, env) {
  const keys = names(env), options = `; Max-Age=0; Path=/api/account; HttpOnly; SameSite=Strict${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', [`${keys.access}=${options}`, `${keys.refresh}=${options}`]);
}
export async function authenticated(req, res, client, env = process.env) {
  const jar = cookies(req), keys = names(env);
  let access = jar.get(keys.access), refreshed = false;
  async function refresh() {
    const token = jar.get(keys.refresh);
    if (!validToken(token)) { clearSession(res, env); throw new HttpError(401, 'Logga in för att fortsätta.'); }
    const session = await client('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } });
    setSession(res, session, env); access = session.access_token; refreshed = true;
  }
  if (!validToken(access)) await refresh();
  let user;
  try { user = await client('/auth/v1/user', { token: access }); }
  catch (error) {
    if (error.status !== 401 || refreshed) throw error;
    await refresh(); user = await client('/auth/v1/user', { token: access });
  }
  if (!/^[a-f0-9-]{36}$/i.test(user?.id ?? '') || !user.email_confirmed_at || !user.email || user.is_anonymous) throw new HttpError(401, 'Bekräfta din e-postadress och logga in igen.');
  return { user, token: access };
}
