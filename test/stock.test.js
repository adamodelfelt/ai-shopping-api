import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { parseStock } from '../lib/ingestion/stock.js';
import { createStockService, validStock } from '../lib/stock.js';
import { createHandler } from '../lib/handler.js';
import { stockFresh, availableSizes, sizeMatches, STOCK_TTL } from '../public/availability.js';
import { appearanceOf, garmentPatterns } from '../lib/taxonomy.js';
import { searchCatalogue } from '../lib/search.js';
import { prepareStore, groupCart } from '../public/checkout-model.js';
import { prototypeRetailers, demoRetailerAllowed, DEMO_CHECKOUT_TIMEOUT } from '../public/retailers.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/stock-products.json', import.meta.url)));
const script = (name, value) => `<script>window.${name} = ${JSON.stringify(value)};</script>`;
const urls = { minirodini: 'https://www.minirodini.com/se/panther-piping-sweatshirt-grey-melange', pop: 'https://www.polarnopyret.se/barnklader/badklader-uv-klader/langarmad-uv-troja-randig-rosa-60603553-5014', newbie: 'https://www.kappahl.com/sv-se/newbie/pojke-0-18-man-44-86/905422', lindex: 'https://www.lindex.com/se/p/3013902-374-beige-randig-stickad-troja', tretorn: 'https://se.tretorn.com/rainshower-set-regnstall-barn-800636719' };
function nuxt(value) {
  const data = [];
  function add(item) { const index = data.length; data.push(null); data[index] = Array.isArray(item) ? item.map(add) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).map(([key, child]) => [key, add(child)])) : item; return index; }
  add(value); return `<script id="__NUXT_DATA__">${JSON.stringify(data)}</script>`;
}
function html(store, input = fixture) {
  if (store === 'minirodini') return script('__remixContext', { state: { loaderData: { 'gears-route-wildcard': { pageResponse: input.mini } } } });
  if (store === 'pop' || store === 'newbie') return script('CURRENT_PAGE', input[store].page) + script('APP_SHELL_DATA', input[store].shell);
  if (store === 'lindex') return nuxt({ state: { $smarketSettings: { currencyCode: input.lindex.currency } }, data: { product: { payload: input.lindex.product } } });
  return script('__INITIAL_STATE__', JSON.stringify(input.tretorn));
}
test('five public retailer product payloads produce actual size IDs, live prices and sold-out options', () => {
  for (const store of Object.keys(urls)) {
    const result = parseStock(store, html(store), urls[store]);
    assert.equal(result.status, 'verified', store);
    assert.ok(result.sizes.every(size => size.id && size.label && typeof size.available === 'boolean'));
  }
  const pop = parseStock('pop', html('pop'), urls.pop);
  assert.equal(pop.price, 349);
  assert.equal(pop.sizes.find(size => size.label === '98/104').available, false);
  assert.equal(pop.sizes.find(size => size.label === '110/116').available, true);
  const lindex = parseStock('lindex', html('lindex'), urls.lindex);
  assert.deepEqual(lindex.sizes.map(size => size.label), ['50', '56', '62', '68']);
});
test('inventory parser rejects another product, aggregate stock and missing or unknown size evidence', () => {
  assert.throws(() => parseStock('minirodini', html('minirodini'), urls.minirodini.replace('grey-melange', 'red')));
  assert.throws(() => parseStock('lindex', html('lindex'), urls.lindex.replace('3013902', '3013903')));
  assert.throws(() => parseStock('arket', '<script type="application/ld+json">{"@type":"Product","offers":{"availability":"https://schema.org/InStock"}}</script>', 'https://www.arket.com/product/a/'));
  const altered = structuredClone(fixture); altered.newbie.page.variations[0].stock = 'maybe';
  assert.throws(() => parseStock('newbie', html('newbie', altered), urls.newbie));
});
test('stock checking deduplicates requests, respects robots, blocks unknown hosts and expires evidence', async () => {
  let time = Date.now(), requests = 0;
  const product = { id: '1', store: 'pop', url: urls.pop, price: 297 };
  const verify = createStockService({ disk: false, now: () => time, interval: 0, fetchImpl: async (url, options) => {
    requests++; assert.equal(options.redirect, 'error');
    return new Response(url.pathname === '/robots.txt' ? 'User-agent: *\nAllow: /' : html('pop'));
  } });
  const [first, duplicate] = await Promise.all([verify([product]), verify([product])]);
  assert.equal(requests, 2); assert.equal(first[0].price, 349); assert.deepEqual(first, duplicate);
  time += STOCK_TTL + 1; await verify([product]); assert.equal(requests, 4);
  const blocked = createStockService({ disk: false, interval: 0, fetchImpl: async () => new Response('User-agent: *\nDisallow: /barnklader') });
  assert.equal((await blocked([product]))[0].availability.status, 'unknown');
  assert.equal((await verify([{ ...product, url: 'https://127.0.0.1/private' }]))[0].availability.status, 'unknown');
});
test('stale, unavailable and future stock is not advertised as available', () => {
  const value = parseStock('pop', html('pop'), urls.pop), now = Date.now();
  assert.equal(stockFresh(value, now), true);
  assert.equal(stockFresh(value, now + STOCK_TTL), false);
  assert.equal(validStock({ ...value, checkedAt: new Date(now + 60_000).toISOString() }), false);
  assert.equal(availableSizes({ availability: { ...value, status: 'unknown' } }).length, 0);
  assert.equal(sizeMatches('50', '110/116'), false);
  assert.equal(sizeMatches('110 - 116', '110/116'), true);
});
test('failed retailer checks log only safe categories and still hide unknown stock', async () => {
  const reports = [];
  for (const [error, reason] of [[new Error('Retailer request stopped (HTTP 403)'), 'http_403'], [new DOMException('private details', 'TimeoutError'), 'timeout'], [new Error('private supplier response and credentials'), 'unverified_response']]) {
    const verify = createStockService({ disk: false, interval: 0, fetchImpl: async () => { throw error; }, reportFailure: entry => reports.push(entry) });
    const [product] = await verify([{ id: '1', store: 'lindex', url: urls.lindex, price: 349 }]);
    assert.equal(product.availability.status, 'unknown');
    assert.deepEqual(reports.at(-1), { event: 'stock_check_failed', retailer: 'lindex', reason });
  }
  assert.ok(!JSON.stringify(reports).includes('private'));
});
test('striped collars, ribbing, piping and three stripes are not an overall striped pattern', () => {
  for (const text of ['Panther Piping Sweatshirt med randig krage', 'Table Tennis Striped Rib Sweatshirt', 'Tröja med tre ränder', 'Sweatshirt med randig V-ringning', 'Randade ribbade kanter']) assert.equal(appearanceOf(text).pattern_tags.includes('striped'), false, text);
  assert.ok(appearanceOf('Randig tröja med randiga muddar').pattern_tags.includes('striped'));
  assert.deepEqual(garmentPatterns({ name: 'Panther Piping Sweatshirt', source_description: 'Har randig krage.', pattern_tags: ['striped'] }), []);
  const base = { retailer: 'minirodini', category: 'sweater', target_age_group: 'kids', in_stock: true, is_visible: true, price_sek: 600, pattern_tags: ['striped'] };
  assert.equal(searchCatalogue([{ ...base, id: '1', name: 'Table Tennis Striped Rib Sweatshirt' }], 'randiga tröjor')[0].products.length, 0);
});
test('checkout rejects sold-out variants, stale evidence and quantities above supplier inventory', () => {
  const product = { id: '1', store: 'pop', price: 349, availability: parseStock('pop', html('pop'), urls.pop) };
  const saved = { email: 'alex@example.com', profile: { firstName: 'Alex', lastName: 'Exempel', phone: '+46700000000', addressLine1: 'Testgatan 1', postalCode: '12345', city: 'Testort', countryCode: 'SE' } };
  const soldout = product.availability.sizes.find(size => !size.available);
  assert.throws(() => prepareStore(groupCart([product], new Map([['1', { variantId: soldout.id, quantity: 1 }]]))[0], saved));
  const live = product.availability.sizes.find(size => size.available); live.quantity = 1;
  assert.throws(() => prepareStore(groupCart([product], new Map([['1', { variantId: live.id, quantity: 2 }]]))[0], saved), /antal/);
  product.availability.checkedAt = '2000-01-01T00:00:00Z';
  assert.throws(() => prepareStore(groupCart([product], new Map([['1', { variantId: live.id, quantity: 1 }]]))[0], saved));
});
test('search API removes unknown stock and wrong sizes before returning results; stock API accepts IDs only', async () => {
  const rows = [{ id: '1', name: 'Randig tröja', retailer: 'pop', category: 'sweater', target_age_group: 'kids', in_stock: true, is_visible: true, price_sek: 297, pattern_tags: ['striped'], product_url: urls.pop }];
  const handle = createHandler({ catalogue: async () => ({ rows, source: 'snapshot' }), profiles: async () => [], limiter: async () => {}, stock: async products => products.map(product => ({ ...product, availability: parseStock('pop', html('pop'), urls.pop) })) });
  async function call(body, route) { const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; req.headers = { 'content-type': 'application/json' }; const res = { setHeader() {}, end(value) { this.value = JSON.parse(value); } }; await handle(req, res, route); return res; }
  assert.equal((await call({ query: 'randiga tröjor i 110/116' }, 'search')).value.groups[0].products.length, 1);
  assert.equal((await call({ query: 'randiga tröjor i 98/104' }, 'search')).value.groups[0].products.length, 0);
  assert.equal((await call({ productIds: ['1'], url: 'https://evil.test/' }, 'stock')).statusCode, 400);
});
test('prototype assortment excludes the blocked retailer across search, similarity and direct stock IDs', async () => {
  const base = { name: 'Randig tröja', category: 'sweater', target_age_group: 'kids', in_stock: true, is_visible: true, price_sek: 349, pattern_tags: ['striped'] };
  const rows = [{ ...base, id: '1', retailer: 'arket', product_url: 'https://www.arket.com/product/a/' }, { ...base, id: '2', retailer: 'pop', product_url: urls.pop }];
  const calls = [];
  const handle = createHandler({ catalogue: async () => ({ rows }), profiles: async () => [{ slug: 'arket', display_name: 'ARKET' }], limiter: async () => {}, stock: async (products, options) => {
    calls.push({ products, options }); assert.ok(products.every(product => product.store !== 'arket'));
    return products.map(product => ({ ...product, availability: parseStock('pop', html('pop'), urls.pop) }));
  } });
  async function call(body, route) { const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; req.headers = { 'content-type': 'application/json' }; const res = { setHeader() {}, end(value) { this.value = JSON.parse(value); } }; await handle(req, res, route); return res; }
  assert.deepEqual((await call({ query: 'randiga tröjor' }, 'search')).value.groups[0].products.map(product => product.store), ['pop']);
  assert.equal((await call({ query: 'ARKET tröja' }, 'search')).value.groups[0].products.length, 0);
  assert.equal((await call({ referenceProductId: '1' }, 'similar')).statusCode, 404);
  assert.deepEqual((await call({ productIds: ['1'] }, 'stock')).value.products, []);
  await call({ productIds: ['2'] }, 'stock');
  assert.ok(calls.at(-1).options.signal instanceof AbortSignal);
  assert.equal(DEMO_CHECKOUT_TIMEOUT, 8000);
});
test('blocked retailer cannot trigger outbound stock traffic or use the prototype checkout', async () => {
  assert.deepEqual(Object.keys(prototypeRetailers).sort(), ['lindex', 'minirodini', 'newbie', 'pop', 'tretorn']);
  assert.equal(demoRetailerAllowed('arket'), false);
  const verify = createStockService({ disk: false, fetchImpl: async () => { assert.fail('Excluded retailer caused a network request'); } });
  const [result] = await verify([{ id: '1', store: 'arket', url: 'https://www.arket.com/product/a/', price: 349 }]);
  assert.equal(result.availability.status, 'unknown');
  assert.throws(() => prepareStore(groupCart([{ id: '1', store: 'arket', price: 349, availability: parseStock('pop', html('pop'), urls.pop) }])[0], null), /Butiken/);
});
test('every retailer in the prototype has a measured successful demo checkout below 60 seconds', async () => {
  const qualification = JSON.parse(await readFile(new URL('../docs/demo-qualification.json', import.meta.url)));
  assert.equal(qualification.targetSeconds, 60);
  assert.equal(qualification.realPayment, false);
  for (const store of Object.keys(prototypeRetailers)) {
    const result = qualification.results.find(entry => entry.retailer === store);
    assert.ok(result?.passed && Number.isFinite(result.seconds) && result.seconds > 0 && result.seconds < qualification.targetSeconds, store);
  }
});
