import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHandler } from '../lib/handler.js';
import { createLimiter, searchBody, enforceLimit, boundedJson, originAllowed } from '../lib/http.js';
import { fetchCatalogue, readConfig } from '../lib/catalogue.js';
import { isSnapshotPreview } from '../lib/environment.js';

async function call(body, { route = 'search', method = 'POST', raw, headers = {}, handler: handle } = {}) {
  const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body))]); req.method = method;
  req.headers = { 'content-type': 'application/json', ...headers }; req.socket = { remoteAddress: '127.0.0.1' };
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(value) { this.value = value ? JSON.parse(value) : null; } };
  const handler = handle ?? createHandler({ catalogue: async () => ({ rows: [], source: 'snapshot', updatedAt: '2026-10-26T00:00:00Z' }), profiles: async () => [], limiter: async () => {} });
  await handler(req, response, route); return response;
}
test('invalid input is rejected before catalogue or AI work', async () => {
  for (const body of [null, [], { query: {} }, { query: 'x'.repeat(501) }, { query: 'tee', excludeProductIds: ['1)or(id.gt.0)'] }, { query: 'tee', excludeProductIds: Array(201).fill('1') }, { query: 'tee', extendSearch: 'true' }, { query: 'tee', extra: 'ignored?' }]) assert.equal((await call(body)).statusCode, 400);
  assert.throws(() => searchBody({ query: 'tee\u0000' }));
  assert.equal((await call({ query: 'tee' }, { raw: '{oops' })).statusCode, 400);
  assert.equal((await call({}, { raw: ' '.repeat(17_000) })).statusCode, 413);
  assert.equal((await call({ query: 'tee' }, { headers: { 'content-type': 'text/plain' } })).statusCode, 415);
});
test('pre-parsed serverless bodies retain input byte limits', async () => {
  await assert.rejects(boundedJson({ headers: { 'content-type': 'application/json' }, body: { query: 'x'.repeat(17_000) } }), error => error.status === 413);
});
test('methods and hostile origins are rejected, security headers survive errors', async () => {
  assert.equal((await call({}, { method: 'GET' })).statusCode, 405);
  const blocked = await call({ query: 'tee' }, { headers: { origin: 'https://evil.test' } });
  assert.equal(blocked.statusCode, 403); assert.equal(blocked.headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(blocked.headers['Content-Security-Policy'].includes("script-src 'self'"));
  assert.equal((await call({}, { method: 'OPTIONS' })).statusCode, 204);
  assert.equal((await call({ query: 'tee' }, { headers: { origin: 'http://127.0.0.1:3000' } })).statusCode, 200);
});
test('exceptions never leak provider details, queries or keys', async () => {
  const handler = createHandler({ catalogue: async () => { throw new Error('provider-secret-and-private-data'); }, profiles: async () => [], limiter: async () => {} });
  const response = await call({ query: 'tee' }, { handler });
  assert.equal(response.statusCode, 503); assert.ok(!JSON.stringify(response).includes('provider-secret')); assert.ok(response.value.requestId);
});
test('search group fan-out and similarity references are bounded', async () => {
  assert.equal((await call({ query: 'tee, tee, tee, tee, tee, tee, tee' })).statusCode, 400);
  assert.equal((await call({ referenceProductId: '0)or(id.gt.0)' }, { route: 'similar' })).statusCode, 400);
  assert.equal((await call({ referenceProductId: '1' }, { route: 'similar' })).statusCode, 404);
});
test('memory quota is bounded, expires, and fails closed when capacity is reached', () => {
  let time = 0;
  const limit = createLimiter({ limit: 2, period: 100, maxKeys: 2, now: () => time });
  assert.equal(limit('a'), true); assert.equal(limit('a'), true); assert.equal(limit('a'), false);
  assert.equal(limit('b'), true); assert.equal(limit('c'), false);
  time = 101; assert.equal(limit('c'), true); assert.equal(limit('a'), true);
});
test('production uses shared quotas and fails closed on missing or invalid configuration', async () => {
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res = { setHeader() {} };
  await assert.rejects(enforceLimit(req, res, { NODE_ENV: 'production' }), error => error.status === 503);
  const env = { NODE_ENV: 'production', RATE_LIMIT_URL: 'https://test.upstash.io', RATE_LIMIT_TOKEN: 'test-only' };
  await assert.rejects(enforceLimit(req, res, env, async () => new Response('{"result":31}')), error => error.status === 429);
  await assert.rejects(enforceLimit(req, res, env, async () => new Response('{"error":"oops"}')), error => error.status === 503);
  await enforceLimit(req, res, env, async () => new Response('{"result":1}'));
});
test('production rejects archive snapshots and privileged or legacy API keys', async () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production', CATALOGUE_SOURCE: 'snapshot' }));
  await assert.rejects(fetchCatalogue({ env: { CATALOGUE_SOURCE: 'supabase', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'old-privileged-key' } }));
  await assert.rejects(fetchCatalogue({ env: { CATALOGUE_SOURCE: 'supabase', SUPABASE_URL: 'https://evil.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } }));
});
test('hosted snapshot runs only on Vercel Preview; production still requires live data and a shared quota', async () => {
  const preview = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', CATALOGUE_SOURCE: 'snapshot', VERCEL_URL: 'whool-test.vercel.app' };
  assert.equal(readConfig(preview), 'snapshot');
  assert.equal(isSnapshotPreview(preview), true);
  assert.throws(() => readConfig({ ...preview, VERCEL_ENV: 'production' }));
  assert.throws(() => readConfig({ ...preview, VERCEL: undefined }));
  const headers = {}, res = { setHeader(name, value) { headers[name] = value; } };
  originAllowed({ headers: { origin: 'https://whool-test.vercel.app' } }, res, preview);
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://whool-test.vercel.app');
  assert.throws(() => originAllowed({ headers: { origin: 'https://evil.vercel.app' } }, res, preview));
  await enforceLimit({ headers: {}, socket: { remoteAddress: 'preview-test' } }, res, preview);
  await assert.rejects(enforceLimit({ headers: {}, socket: {} }, res, { ...preview, VERCEL_ENV: 'production' }), error => error.status === 503);
});
test('catalogue reader paginates, uses a publishable key only, and excludes unsafe rows', async () => {
  const row = { id: 1, is_visible: true, in_stock: true, target_age_group: 'kids', price_sek: 199 };
  let calls = 0;
  const result = await fetchCatalogue({ env: { CATALOGUE_SOURCE: 'supabase', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, fetchImpl: async (url, options) => {
    assert.equal(options.headers.apikey, 'sb_publishable_test'); assert.equal(options.headers.authorization, undefined);
    assert.equal(url.searchParams.get('target_age_group'), 'in.(kids,baby,teen)');
    calls++;
    return new Response(JSON.stringify(calls === 1 ? Array.from({ length: 1000 }, (_, i) => ({ ...row, id: i })) : [{ ...row, id: 1001 }, { ...row, id: 1002, target_age_group: 'adult' }]));
  } });
  assert.equal(calls, 2); assert.equal(result.rows.length, 1001);
});
