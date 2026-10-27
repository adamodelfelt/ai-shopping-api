import test from 'node:test';
import assert from 'node:assert/strict';
import { searchVerified } from '../lib/search-stock.js';
import { createStockService } from '../lib/stock.js';

const row = (id, overrides = {}) => ({ id: String(id), name: 'Randig tröja', retailer: 'lindex', category: 'sweater', target_age_group: 'kids', is_visible: true, in_stock: true, price_sek: 249, pattern_tags: ['striped'], product_url: `https://www.lindex.com/se/p/${id}-374-randig-troja`, ...overrides });
const availability = (label = '110/116') => ({ status: 'verified', checkedAt: new Date().toISOString(), price: 249, sizes: [{ id: 'sku', label, available: true, price: 249 }] });

test('search finds verified stock beyond the first eight candidates and preserves size constraints', async () => {
  const calls = [];
  const groups = await searchVerified(Array.from({ length: 24 }, (_, index) => row(index + 1)), 'randiga tröjor i 110/116', [], {}, async (products, { signal }) => {
    assert.ok(signal instanceof AbortSignal); calls.push(...products.map(product => product.id));
    return products.map(product => ({ ...product, availability: Number(product.id) <= 8 ? { status: 'unknown', sizes: [] } : availability(Number(product.id) <= 10 ? '86/92' : '110/116') }));
  });
  assert.equal(groups[0].products.length, 8);
  assert.ok(groups[0].products.every(product => Number(product.id) > 10));
  assert.equal(new Set(calls).size, calls.length);
  assert.match(groups[0].notice, /Lindex.*kunde inte verifieras/);
});

test('six-group fan-out stays within 48 checks and never promotes stale or unknown stock', async () => {
  const rows = ['sweater', 'pants', 'jacket', 'dress', 'body', 'socks'].flatMap((category, group) => Array.from({ length: 40 }, (_, index) => row(group * 100 + index + 1, { category })));
  const checked = [];
  const groups = await searchVerified(rows, 'tröja, byxor, jacka, klänning, body, strumpor', [], {}, async products => {
    checked.push(...products);
    return products.map(product => ({ ...product, availability: { ...availability(), checkedAt: '2000-01-01T00:00:00Z' } }));
  });
  assert.equal(groups.length, 6); assert.equal(checked.length, 48);
  assert.ok(groups.every(group => group.products.length === 0));
  assert.equal(new Set(checked.map(product => product.id)).size, 48);
});

test('refresh exclusions and requested brand remain hard constraints during backfill', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => row(index + 1));
  rows.push(row(99, { retailer: 'pop', product_url: 'https://www.polarnopyret.se/barnklader/troja' }));
  const groups = await searchVerified(rows, 'Lindex tröja', [{ slug: 'lindex', display_name: 'Lindex' }], { excludeProductIds: ['1', '2', '3'] }, async products => products.map(product => ({ ...product, availability: availability() })));
  assert.equal(groups[0].products.length, 8);
  assert.ok(groups[0].products.every(product => product.store === 'lindex' && !['1', '2', '3'].includes(product.id)));
});

test('retailer denial stops the batch, respects cooldown and still checks other stores', async () => {
  let time = Date.now(), denied = 0, otherRequests = 0;
  const verify = createStockService({ disk: false, interval: 0, now: () => time, reportFailure() {}, fetchImpl: async url => {
    if (url.hostname === 'www.lindex.com') { denied++; return new Response('', { status: 403 }); }
    otherRequests++; return new Response('User-agent: *\nDisallow: /');
  } });
  const products = Array.from({ length: 12 }, (_, index) => ({ id: String(index + 1), store: 'lindex', url: row(index + 1).product_url, price: 249 }));
  assert.ok((await verify(products)).every(product => product.availability.status === 'unknown'));
  assert.equal(denied, 1);
  await verify(products); assert.equal(denied, 1);
  await verify([{ id: '99', store: 'pop', url: 'https://www.polarnopyret.se/barnklader/troja', price: 249 }]);
  assert.equal(otherRequests, 1);
  time += 60_001; await verify(products); assert.equal(denied, 2);
});

test('an aborted search does not start retailer traffic', async () => {
  const controller = new AbortController(); controller.abort();
  const groups = await searchVerified([row(1)], 'tröja', [], {}, async () => { assert.fail('Aborted search started stock checking'); }, { signal: controller.signal });
  assert.equal(groups[0].products.length, 0);
});

test('one robots read is reused per retailer in a call without reusing expired abort signals', async () => {
  let robots = 0;
  const verify = createStockService({ disk: false, interval: 0, reportFailure() {}, fetchImpl: async url => {
    if (url.pathname === '/robots.txt') { robots++; return new Response('User-agent: *\nAllow: /'); }
    return new Response('<html>unparseable</html>');
  } });
  const products = [1, 2].map(id => ({ id: String(id), store: 'lindex', url: row(id).product_url, price: 249 }));
  const first = new AbortController(); await verify(products, { signal: first.signal }); first.abort();
  assert.equal(robots, 1);
  await verify([{ ...products[0], url: row(3).product_url }]);
  assert.equal(robots, 2);
});
