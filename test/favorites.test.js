import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavoriteStore, favoriteIds } from '../public/favorites-model.js';
import { browserFavoriteStorage } from '../public/favorites-storage.js';
import { searchCatalogue, parseIntent, rankRows } from '../lib/search.js';
import { productColor, colorTone } from '../lib/taxonomy.js';
import { searchBody } from '../lib/http.js';

const row = (id, extra = {}) => ({ id: String(id), name: 'Byxor', category: 'pants', subcategory: 'pants', retailer: 'pop', brand: 'Polarn O. Pyret', color: 'red', price_sek: 249, is_visible: true, in_stock: true, target_age_group: 'kids', product_url: `https://www.polarnopyret.se/barnklader/byxor-${id}`, ...extra });
test('red keeps vivid red and burgundy, excludes orange and multicolor unless explicitly expanded', () => {
  const rows = [row(1), row(2, { name: 'Byxor vinröd' }), row(3, { color: 'orange' }), row(4, { name: 'Rutiga byxor', pattern_tags: ['checked'] }), row('782309277118013', { retailer: 'minirodini' }), row(6, { source_description: 'Ett heltäckande print' })];
  const strict = searchCatalogue(rows, 'röda byxor')[0].products;
  assert.deepEqual(strict.map(product => product.id), ['1', '2']);
  assert.equal(productColor(rows[4]), 'orange'); assert.equal(colorTone(rows[1]), 'burgundy');
  assert.deepEqual(searchCatalogue(rows, 'vinröda byxor')[0].products.map(product => product.id), ['2']);
  const expanded = searchCatalogue(rows, 'röda byxor', [], { extendSearch: true })[0].products;
  assert.ok(expanded.some(product => product.id === '3'));
  assert.ok(expanded.some(product => product.id === '4'));
  assert.ok(searchCatalogue(rows, 'röda rutiga byxor')[0].products.some(product => product.id === '4'));
});
test('generic trousers exclude shell, padded, waterproof and tights while explicit shell queries keep shell trousers', () => {
  const rows = [row(1), row(2, { name: 'Vattentäta vadderade byxor ARCTIC' }), row(3, { name: 'Polar Insulated Shell Trousers — Vattentät Skalbyxa Barn' }), row(4, { name: 'Regnbyxor' }), row(5, { name: 'Strumpbyxor' }), row(6, { name: 'Jeans' })];
  assert.deepEqual(searchCatalogue(rows, 'byxor')[0].products.map(product => product.id), ['1', '6']);
  assert.deepEqual(new Set(searchCatalogue(rows, 'skalbyxor')[0].products.map(product => product.id)), new Set(['2', '3', '4']));
  assert.equal(searchCatalogue([row(1)], 'skalbyxor')[0].products.length, 0);
});
test('burgundy favorites change ranking without admitting orange, shell trousers or excluded products', () => {
  const rows = [row(1), row(2, { name: 'Byxor vinröd' }), row(3, { name: 'Byxor vinröd' }), row(4, { color: 'orange' }), row(5, { name: 'Skalbyxor vinröd' })];
  const base = rankRows(rows.slice(0, 3), parseIntent('röda byxor'), 'röda byxor', []);
  const personalized = searchCatalogue(rows, 'röda byxor', [], { favoriteProductIds: ['3'], excludeProductIds: ['3'] })[0].products;
  assert.equal(base[0].id, '1'); assert.equal(personalized[0].id, '2');
  assert.ok(personalized.every(product => !['3', '4', '5'].includes(product.id)));
  assert.throws(() => searchBody({ query: 'byxor', favoriteProductIds: ['https://evil.test'] }));
  assert.throws(() => searchBody({ query: 'byxor', favoriteProductIds: Array(41).fill('1') }));
});
test('local favorites survive reload, account favorites are unioned and vanish on logout without contaminating local storage', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const first = createFavoriteStore(storage); first.toggleLocal('1'); first.toggleLocal('2');
  const next = createFavoriteStore(storage); assert.deepEqual(next.ids(), ['1', '2']);
  next.setAccount('user-a', ['2', '3']); assert.deepEqual(next.ids(), ['1', '2', '3']);
  next.setAccount(null); assert.deepEqual(next.ids(), ['1', '2']);
  next.setAccount('user-b', ['4']); assert.deepEqual(next.accountIds(), ['4']);
  assert.deepEqual(JSON.parse(data.get('whool:favorites:v1')), ['1', '2']);
  next.toggleLocal('1'); assert.equal(next.has('1'), false);
});
test('favorite storage handles invalid input, unavailable storage and the 100-product limit', () => {
  assert.deepEqual(favoriteIds(['1', '1', {}, '<script>', '2']), ['1', '2']);
  const store = createFavoriteStore({ getItem() { throw new Error(); }, setItem() { throw new Error(); } });
  store.toggleLocal('1'); assert.equal(store.has('1'), true); assert.equal(store.persistent(), false);
  for (let i = 2; i <= 100; i++) store.toggleLocal(String(i));
  assert.throws(() => store.toggleLocal('101'), /100/);
  assert.throws(() => store.toggleLocal('invalid'));
});
test('persistent storage adapter refuses profiles, tokens and other keys', () => {
  const writes = [], adapter = browserFavoriteStorage({ localStorage: { getItem() { return '[]'; }, setItem(key, value) { writes.push({ key, value }); } } });
  adapter.setItem('whool:favorites:v1', '["1","2"]');
  assert.throws(() => adapter.setItem('profile', '["1"]'));
  assert.throws(() => adapter.setItem('whool:favorites:v1', '{"email":"alex@example.com"}'));
  assert.throws(() => adapter.setItem('whool:favorites:v1', '["test-token"]'));
  assert.equal(writes.length, 1);
});
