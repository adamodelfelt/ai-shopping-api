import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assignedJson, unpackNuxt, mapArket, mapPop, parseMini, mapNewbie, mapLindex, mapTretorn } from '../lib/ingestion/parsers.js';
import { validateProduct } from '../lib/ingestion/model.js';
import { robotsAllows, retailerClient } from '../lib/ingestion/http.js';
import { collect } from '../lib/ingestion/collect.js';
import { importPlan } from '../scripts/import.js';
import { classificationPlan } from '../scripts/classify.js';

const read = async name => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url)));
const script = (name, data) => `<script>window.${name} = ${JSON.stringify(data)}; throw 'not executed';</script>`;
test('retailer assignments parse JSON only and never execute trailing source', () => {
  assert.deepEqual(assignedJson(script('TEST', { value: '}quoted{', nested: { a: 1 } }), 'TEST'), { value: '}quoted{', nested: { a: 1 } });
  assert.throws(() => assignedJson('<script>window.TEST = {a:process.exit()};</script>', 'TEST'));
  assert.deepEqual(assignedJson('<script>window.TEST = {"a":undefined,"b":"undefined"};</script>', 'TEST', { undefinedAsNull: true }), { a: null, b: 'undefined' });
  assert.throws(() => assignedJson('<script>window.TEST = {"a":undefinedX};</script>', 'TEST', { undefinedAsNull: true }));
});
test('Nuxt data is decoded without executable revivers or prototype mutation', () => {
  const unpacked = unpackNuxt([{ data: 1 }, ['ShallowReactive', 2], { currency: 3 }, 'SEK']);
  assert.equal(unpacked.data.currency, 'SEK');
  assert.throws(() => unpackNuxt([['Function', 1], 'process.exit()']));
  assert.throws(() => unpackNuxt([{ value: 99 }]));
});
test('six retailer mappings preserve evidence, decimals, age and verified stock', async () => {
  const arket = await read('arket-listing'), pop = await read('pop-listing'), mini = await read('minirodini-product'), extra = await read('extra-retailers');
  assert.equal(mapArket(arket.products[0]).retailer, 'arket');
  assert.equal(mapPop(pop.page.productList.products[0]).retailer, 'pop');
  assert.equal(parseMini(script('__remixContext', mini), 'https://www.minirodini.com/se/product').retailer, 'minirodini');
  const newbie = extra.newbie.map(mapNewbie).filter(Boolean); assert.ok(newbie.length); assert.ok(newbie.every(row => ['kids', 'baby'].includes(row.target_age_group)));
  assert.equal(mapLindex(extra.lindex, 'kids').retailer, 'lindex');
  assert.equal(mapTretorn(extra.tretorn).retailer, 'tretorn');
  const decimal = mapLindex({ ...extra.lindex, salePrice: { value: 39.5 } }, 'kids'); assert.equal(decimal.price_sek, 39.5);
  assert.throws(() => mapArket({ ...arket.products[0], available: null }));
  assert.throws(() => mapTretorn({ ...extra.tretorn, variations: [{ in_stock: null }] }));
});
test('robots allow/disallow specificity, redirects and host restrictions stop unsafe collection', async () => {
  const rules = 'User-agent: *\nDisallow: /private\nAllow: /private/public\nUser-agent: Whool\nDisallow: /blocked\nAllow: /';
  assert.equal(robotsAllows(rules, 'https://www.arket.com/blocked/a'), false);
  assert.equal(robotsAllows(rules, 'https://www.arket.com/private'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/public', 'https://www.arket.com/private/a'), false);
  const get = await retailerClient('https://www.arket.com', { interval: 0, sleep: async () => {}, fetchImpl: async (url, options) => { assert.equal(options.redirect, 'error'); return new Response(url.pathname === '/robots.txt' ? 'User-agent: *\nDisallow: /blocked' : '{}'); } });
  await assert.rejects(async () => get('https://evil.test/'));
  await assert.rejects(async () => get('https://www.arket.com/blocked'));
});
test('pagination coverage and limited runs cannot silently become complete imports', async () => {
  const fixture = await read('arket-listing');
  const listing = { ...fixture, initialTotalItems: fixture.products.length, pageSize: fixture.products.length };
  const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { blocks: [listing] } } })}</script>`;
  const full = await collect('arket', async () => html);
  assert.equal(full.complete, true); assert.ok(full.products.length);
  const limited = await collect('arket', async () => html, { limit: 1 }); assert.equal(limited.complete, false);
  assert.throws(() => importPlan(limited, []));
  const repeated = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { blocks: [{ ...listing, initialTotalItems: listing.initialTotalItems * 2 }] } } })}</script>`;
  await assert.rejects(collect('arket', async () => repeated));
});
test('imports preserve reviewed classification and leave absent products untouched', async () => {
  const fixture = await read('arket-listing'), product = mapArket(fixture.products[0]);
  const previous = { ...product, id: 1, category: 'reviewed-category', print_tags: ['human-reviewed'], classification: { review_state: 'reviewed' } };
  const plan = importPlan({ store: 'arket', complete: true, products: [{ ...product, currency: 'SEK' }] }, [previous, { ...previous, product_url: 'https://www.arket.com/untouched' }]);
  assert.equal(plan.rows[0].category, 'reviewed-category'); assert.deepEqual(plan.rows[0].print_tags, ['human-reviewed']); assert.equal(plan.untouched, 1);
  assert.equal(classificationPlan([previous]).length, 0);
  assert.throws(() => validateProduct({ ...product, currency: 'SEK', price_sek: null }));
  assert.throws(() => importPlan({ store: 'arket', complete: true, products: [{ ...product, currency: 'SEK' }, { ...product, currency: 'SEK' }] }, []));
});
