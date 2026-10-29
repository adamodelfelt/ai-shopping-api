import { randomUUID } from 'node:crypto';
import { securityHeaders, json, HttpError, boundedJson, objectBody, originAllowed, enforceLimit } from '../http.js';
import { accountConfig, createAccountClient } from './client.js';
import { authenticated, setSession, clearSession } from './session.js';
import { normalizeProfile, validateEmail } from '../../public/profile.js';
import { favoriteIds } from '../../public/favorites-model.js';

const columns = 'user_id,first_name,last_name,phone,address_line1,address_line2,care_of,postal_code,city,country_code';
const toDatabase = (userId, profile) => ({ user_id: userId, first_name: profile.firstName, last_name: profile.lastName, phone: profile.phone, address_line1: profile.addressLine1, address_line2: profile.addressLine2, care_of: profile.careOf, postal_code: profile.postalCode, city: profile.city, country_code: profile.countryCode });
const fromDatabase = row => row ? { firstName: row.first_name, lastName: row.last_name, phone: row.phone, addressLine1: row.address_line1, addressLine2: row.address_line2, careOf: row.care_of ?? '', postalCode: row.postal_code, city: row.city, countryCode: row.country_code } : null;
export function createAccountHandler({ env = process.env, fetchImpl = fetch, limiter = enforceLimit } = {}) {
  return async (req, res) => {
    securityHeaders(res); res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Vary', 'Cookie, Origin');
    const requestId = randomUUID(); res.setHeader('X-Request-Id', requestId);
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Metoden är inte tillåten.'); }
      // Profile operations have no cross-origin API. Never return a profile to a store origin.
      originAllowed(req, res, { ...env, ALLOWED_ORIGINS: '' });
      if (req.method === 'POST' && !req.headers.origin) throw new HttpError(403, 'Öppna kontot från Whool för att fortsätta.');
      const config = accountConfig(env);
      // Real accounts always require a shared quota on hosted production runtimes,
      // including a Vercel Preview that otherwise uses a catalogue snapshot.
      await limiter(req, res, config && env.NODE_ENV === 'production' ? { ...env, CATALOGUE_SOURCE: 'supabase' } : env);
      if (!config) {
        if (req.method === 'GET') return json(res, 200, { enabled: false, authenticated: false, profile: null });
        throw new HttpError(503, 'Kontotjänsten är inte aktiverad ännu. Inga uppgifter har sparats på servern.');
      }
      const client = createAccountClient(config, fetchImpl);
      if (req.method === 'GET') {
        let session;
        try { session = await authenticated(req, res, client, env); }
        catch (error) { if (error.status === 401) return json(res, 200, { enabled: true, authenticated: false, profile: null }); throw error; }
        const rows = await client(`/rest/v1/account_profiles?${new URLSearchParams({ select: columns, user_id: `eq.${session.user.id}`, limit: '1' })}`, { token: session.token });
        if (!Array.isArray(rows) || rows.length > 1 || rows[0] && rows[0].user_id !== session.user.id) throw new HttpError(503, 'Profilen kunde inte läsas.');
        const saved = await client(`/rest/v1/account_favorites?${new URLSearchParams({ select: 'user_id,product_ids', user_id: `eq.${session.user.id}`, limit: '1' })}`, { token: session.token });
        if (!Array.isArray(saved) || saved.length > 1 || saved[0] && saved[0].user_id !== session.user.id) throw new HttpError(503, 'Favoriterna kunde inte läsas.');
        return json(res, 200, { enabled: true, authenticated: true, userId: session.user.id, email: session.user.email, profile: fromDatabase(rows[0]), favoriteIds: favoriteIds(saved[0]?.product_ids) });
      }
      const body = await boundedJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Ogiltig förfrågan.');
      if (body.action === 'send-code') {
        objectBody(body, ['action', 'email']);
        if (!validateEmail(body.email)) throw new HttpError(400, 'Ange en giltig e-postadress.');
        await client('/auth/v1/otp', { method: 'POST', body: { email: body.email.trim(), create_user: true } });
        return json(res, 200, { sent: true });
      }
      if (body.action === 'verify-code') {
        objectBody(body, ['action', 'email', 'code']);
        if (!validateEmail(body.email) || typeof body.code !== 'string' || !/^\d{6,10}$/.test(body.code)) throw new HttpError(400, 'Kontrollera e-postadressen och engångskoden.');
        const session = await client('/auth/v1/verify', { method: 'POST', body: { email: body.email.trim(), token: body.code, type: 'email' } });
        if (!session?.user?.email_confirmed_at || session.user.is_anonymous) throw new HttpError(401, 'E-postadressen behöver bekräftas.');
        setSession(res, session, env);
        return json(res, 200, { authenticated: true });
      }
      if (body.action === 'logout') {
        objectBody(body, ['action']);
        try { const session = await authenticated(req, res, client, env); await client('/auth/v1/logout?scope=local', { method: 'POST', token: session.token }); }
        catch (error) { if (error.status !== 401) throw error; }
        finally { clearSession(res, env); }
        return json(res, 200, { authenticated: false });
      }
      if (body.action === 'save-favorites') {
        objectBody(body, ['action', 'productIds']);
        if (!Array.isArray(body.productIds) || body.productIds.length > 100 || favoriteIds(body.productIds).length !== body.productIds.length) throw new HttpError(400, 'Välj högst 100 giltiga, unika favoriter.');
        const session = await authenticated(req, res, client, env);
        await client('/rest/v1/account_favorites?on_conflict=user_id', { method: 'POST', token: session.token, prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: session.user.id, product_ids: body.productIds } });
        return json(res, 200, { favoriteIds: body.productIds });
      }
      if (!['save-profile', 'delete-profile'].includes(body.action)) throw new HttpError(400, 'Ogiltig kontoåtgärd.');
      objectBody(body, body.action === 'save-profile' ? ['action', 'profile'] : ['action']);
      let profile;
      if (body.action === 'save-profile') { try { profile = normalizeProfile(body.profile); } catch (error) { throw new HttpError(400, error.message); } }
      const session = await authenticated(req, res, client, env);
      if (body.action === 'delete-profile') {
        await client(`/rest/v1/account_profiles?${new URLSearchParams({ user_id: `eq.${session.user.id}` })}`, { method: 'DELETE', token: session.token, prefer: 'return=minimal' });
        return json(res, 200, { profile: null });
      }
      await client('/rest/v1/account_profiles?on_conflict=user_id', { method: 'POST', token: session.token, prefer: 'resolution=merge-duplicates,return=minimal', body: toDatabase(session.user.id, profile) });
      return json(res, 200, { profile });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      // Never log an email, phone number, address, cookie, token, or provider response.
      if (status >= 500) console.error(JSON.stringify({ event: 'account_request_failed', requestId, status }));
      return json(res, status, { error: status >= 500 ? 'Kontotjänsten är inte tillgänglig. Inga nya uppgifter har bekräftats sparade.' : error.message, requestId });
    }
  };
}
export const accountHandler = createAccountHandler();
