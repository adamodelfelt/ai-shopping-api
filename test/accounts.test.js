import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAccountHandler } from '../lib/accounts/handler.js';
import { accountConfig } from '../lib/accounts/client.js';
import { normalizeProfile, autofillValues, validateEmail } from '../public/profile.js';

const userId = '11111111-1111-4111-8111-111111111111';
const env = { NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://127.0.0.1:3000', ACCOUNT_AUTH_READY: 'true', ACCOUNT_SUPABASE_URL: 'https://accounttest.supabase.co', ACCOUNT_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_account_test' };
const profile = { firstName: 'Alex', lastName: 'Exempel', phone: '070 000 00 00', addressLine1: 'Exempelgatan 1', addressLine2: '', postalCode: '123 45', city: 'Exempelstad', countryCode: 'SE' };
const user = { id: userId, email: 'alex@example.com', email_confirmed_at: '2026-10-27T00:00:00Z', is_anonymous: false };
const tokens = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 900, user };
const row = { user_id: userId, first_name: 'Alex', last_name: 'Exempel', phone: '+46700000000', address_line1: 'Exempelgatan 1', address_line2: '', postal_code: '12345', city: 'Exempelstad', country_code: 'SE' };
function provider(calls, overrides = {}) {
  return async (url, options) => {
    assert.equal(url.origin, 'https://accounttest.supabase.co'); assert.equal(options.redirect, 'error');
    calls.push({ url, options });
    if (overrides[url.pathname]) return overrides[url.pathname](url, options);
    if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify(user));
    if (['/auth/v1/verify', '/auth/v1/token'].includes(url.pathname)) return new Response(JSON.stringify(tokens));
    if (url.pathname === '/rest/v1/account_profiles' && options.method === 'GET') return new Response(JSON.stringify([row]));
    if (url.pathname === '/rest/v1/account_favorites' && options.method === 'GET') return new Response('[]');
    return new Response(null, { status: 204 });
  };
}
async function call(body, { method = body ? 'POST' : 'GET', settings = env, fetchImpl = provider([]), cookie = '', origin = 'http://127.0.0.1:3000', limiter = async () => {} } = {}) {
  const req = Readable.from([Buffer.from(body ? JSON.stringify(body) : '')]); req.method = method;
  req.headers = { 'content-type': 'application/json', cookie, ...(origin ? { origin } : {}) };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(value) { this.body = JSON.parse(value); } };
  await createAccountHandler({ env: settings, fetchImpl, limiter })(req, res); return res;
}
test('delivery profile validation normalizes Swedish phone and postcode without accepting ownership or email fields', () => {
  const result = normalizeProfile(profile); assert.equal(result.phone, '+46700000000'); assert.equal(result.postalCode, '12345');
  for (const bad of [{ ...profile, user_id: userId }, { ...profile, email: 'other@example.com' }, { ...profile, firstName: 'A\r\nB' }, { ...profile, countryCode: 'XX' }, { ...profile, postalCode: '1' }, { ...profile, phone: 'not-a-number' }]) assert.throws(() => normalizeProfile(bad));
  assert.equal(validateEmail('alex@example.com\r\nX-Test: 1'), false);
  assert.equal(autofillValues(profile, 'alex@example.com').fullName, 'Alex Exempel');
  const careOf = normalizeProfile({ ...profile, addressLine2: 'Lägenhet 1201', careOf: 'Exempelbolaget' });
  assert.equal(careOf.addressLine2, 'Lägenhet 1201'); assert.equal(careOf.careOf, 'Exempelbolaget');
  assert.equal(autofillValues(careOf, 'alex@example.com').deliveryPostalCode, careOf.postalCode);
});
test('accounts fail closed until explicitly configured and never accept a legacy or service key', async () => {
  for (const settings of [{}, { ...env, ACCOUNT_AUTH_READY: 'false' }, { ...env, ACCOUNT_SUPABASE_PUBLISHABLE_KEY: 'legacy-token' }, { ...env, ACCOUNT_SUPABASE_URL: 'https://evil.test' }]) assert.equal(accountConfig(settings), null);
  const response = await call(undefined, { settings: {} }); assert.equal(response.body.enabled, false); assert.equal(response.body.profile, null);
  assert.equal((await call({ action: 'save-profile', profile }, { settings: {} })).statusCode, 503);
});
test('account favorites are private, bounded and owned by the verified session', async () => {
  const calls = [], fetchImpl = provider(calls, { '/rest/v1/account_favorites': async (url, options) => options.method === 'GET' ? new Response(JSON.stringify([{ user_id: userId, product_ids: ['1', '2'] }])) : new Response(null, { status: 204 }) });
  const current = await call(undefined, { cookie: 'whool_access=test-access-token', fetchImpl });
  assert.deepEqual(current.body.favoriteIds, ['1', '2']);
  assert.equal(current.body.userId, userId);
  assert.equal(calls.find(item => item.url.pathname === '/rest/v1/account_favorites').url.searchParams.get('user_id'), `eq.${userId}`);
  const saved = await call({ action: 'save-favorites', productIds: ['3', '4'] }, { cookie: 'whool_access=test-access-token', fetchImpl });
  assert.deepEqual(saved.body.favoriteIds, ['3', '4']);
  const write = calls.find(item => item.url.pathname === '/rest/v1/account_favorites' && item.options.method === 'POST');
  assert.deepEqual(JSON.parse(write.options.body), { user_id: userId, product_ids: ['3', '4'] });
  assert.equal((await call({ action: 'save-favorites', productIds: ['1'] })).statusCode, 401);
  assert.equal((await call({ action: 'save-favorites', productIds: ['1'], user_id: 'someone-else' }, { cookie: 'whool_access=test-access-token' })).statusCode, 400);
  assert.equal((await call({ action: 'save-favorites', productIds: ['1', '1'] }, { cookie: 'whool_access=test-access-token' })).statusCode, 400);
  assert.equal((await call({ action: 'save-favorites', productIds: Array(101).fill('1') }, { cookie: 'whool_access=test-access-token' })).statusCode, 400);
  const wrongOwner = await call(undefined, { cookie: 'whool_access=test-access-token', fetchImpl: provider([], { '/rest/v1/account_favorites': async () => new Response(JSON.stringify([{ user_id: 'another-user', product_ids: ['9'] }])) }) });
  assert.equal(wrongOwner.statusCode, 503); assert.ok(!JSON.stringify(wrongOwner.body).includes('another-user'));
});
test('anonymous requests cannot read profiles; hostile and missing mutation origins are rejected', async () => {
  const calls = [];
  const response = await call(undefined, { fetchImpl: provider(calls) }); assert.equal(response.body.authenticated, false); assert.equal(calls.length, 0);
  assert.equal((await call({ action: 'save-profile', profile }, { cookie: 'whool_access=test-access-token', origin: 'https://evil.test', settings: { ...env, ALLOWED_ORIGINS: 'https://evil.test' } })).statusCode, 403);
  assert.equal((await call({ action: 'save-profile', profile }, { origin: null })).statusCode, 403);
});
test('email code verification keeps all tokens in HttpOnly cookies, never in client JSON', async () => {
  const calls = [], fetchImpl = provider(calls);
  const sent = await call({ action: 'send-code', email: 'alex@example.com' }, { fetchImpl }); assert.equal(sent.statusCode, 200);
  assert.equal(JSON.parse(calls[0].options.body).create_user, true);
  const verified = await call({ action: 'verify-code', email: 'alex@example.com', code: '123456' }, { fetchImpl, settings: { ...env, NODE_ENV: 'production' } });
  assert.equal(verified.statusCode, 200); assert.equal(verified.body.authenticated, true);
  assert.ok(!JSON.stringify(verified.body).includes('test-access-token'));
  for (const cookie of verified.headers['set-cookie']) for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/account']) assert.ok(cookie.includes(flag));
});
test('profile read and writes derive ownership from the verified user and retain no-store', async () => {
  const calls = [], fetchImpl = provider(calls);
  const response = await call(undefined, { cookie: 'whool_access=test-access-token', fetchImpl });
  assert.equal(response.body.email, user.email); assert.equal(response.body.profile.firstName, 'Alex');
  assert.equal(response.headers['cache-control'], 'no-store, private');
  const query = calls.find(call => call.url.pathname === '/rest/v1/account_profiles'); assert.equal(query.url.searchParams.get('user_id'), `eq.${userId}`);
  const saved = await call({ action: 'save-profile', profile }, { cookie: 'whool_access=test-access-token', fetchImpl });
  assert.equal(saved.statusCode, 200);
  const write = calls.findLast(call => call.options.method === 'POST' && call.url.pathname === '/rest/v1/account_profiles');
  assert.equal(JSON.parse(write.options.body).user_id, userId); assert.equal(write.options.headers.authorization, 'Bearer test-access-token');
  assert.ok(!JSON.stringify(saved.body).includes(userId));
  assert.equal((await call({ action: 'save-profile', profile: { ...profile, user_id: '22222222-2222-4222-8222-222222222222' } }, { cookie: 'whool_access=test-access-token', fetchImpl })).statusCode, 400);
});
test('expired sessions refresh server-side and forged or unconfirmed identities cannot access profiles', async () => {
  const calls = [], fetchImpl = provider(calls);
  const response = await call(undefined, { cookie: 'whool_refresh=test-refresh-token', fetchImpl });
  assert.equal(response.body.authenticated, true); assert.ok(response.headers['set-cookie']);
  assert.ok(calls.some(call => call.url.pathname === '/auth/v1/token'));
  const bad = provider([], { '/auth/v1/user': async () => new Response(JSON.stringify({ ...user, email_confirmed_at: null })) });
  assert.equal((await call({ action: 'save-profile', profile }, { cookie: 'whool_access=forged-token', fetchImpl: bad })).statusCode, 401);
});
test('deletion filters the authenticated owner and logout clears both cookies', async () => {
  const calls = [], fetchImpl = provider(calls);
  const removed = await call({ action: 'delete-profile' }, { cookie: 'whool_access=test-access-token', fetchImpl }); assert.equal(removed.body.profile, null);
  const request = calls.find(call => call.options.method === 'DELETE'); assert.equal(request.url.searchParams.get('user_id'), `eq.${userId}`);
  const logout = await call({ action: 'logout' }, { cookie: 'whool_access=test-access-token', fetchImpl });
  assert.equal(logout.body.authenticated, false); assert.ok(logout.headers['set-cookie'].every(cookie => cookie.includes('Max-Age=0')));
  assert.equal((await call({ action: 'logout' }, { fetchImpl })).statusCode, 200);
});
test('real accounts require the shared hosted quota even in a snapshot preview', async () => {
  let observed;
  await call(undefined, { settings: { ...env, NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', CATALOGUE_SOURCE: 'snapshot' }, limiter: async (req, res, settings) => { observed = settings; } });
  assert.equal(observed.CATALOGUE_SOURCE, 'supabase');
});
test('provider errors never return raw input, credentials or provider response bodies', async () => {
  const fetchImpl = async () => new Response('sensitive-provider-response-address-email-cookie', { status: 500 });
  const response = await call({ action: 'send-code', email: 'alex@example.com' }, { fetchImpl });
  assert.equal(response.statusCode, 503); assert.ok(!JSON.stringify(response.body).includes('sensitive-provider')); assert.ok(!JSON.stringify(response.body).includes('alex@example.com'));
});
