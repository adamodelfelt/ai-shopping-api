import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseIntent, splitQuery, searchCatalogue, similarProducts, diverse } from '../lib/search.js';
import { categoryOf, appearanceOf } from '../lib/taxonomy.js';
import { safeUrl, publicProduct } from '../lib/links.js';
import { makeGroup, visible, mergeRefresh } from '../public/state.js';

const brands = JSON.parse(await readFile(new URL('../config/brand-profiles.json', import.meta.url))).brands;
const base = { category: 'jacket', subcategory: 'jacket', is_visible: true, in_stock: true, target_age_group: 'kids', color: 'blue', price_sek: 199.5, image_url: 'https://media.arket.com/item.jpg', product_url: 'https://www.arket.com/sv-se/product/a/', print_tags: [], pattern_tags: [], motif_tags: [], decoration_tags: [] };
function row(id, retailer = 'arket', extra = {}) { return { ...base, id: String(id), retailer, brand: retailer, name: `Jacka ${id}`, product_group_id: `${retailer}:${id}`, ...extra }; }
const products = [...Array.from({ length: 1050 }, (_, i) => row(i + 1)), row(2001, 'minirodini'), row(2002, 'lindex'), row(3001, 'newbie', { category: 'sweater', name: 'Randig tröja med hundtryck', pattern_tags: ['striped'], print_tags: ['printed'], motif_tags: ['dog'] }), row(3002, 'lindex', { category: 'sweater', name: 'Randig tröja', pattern_tags: ['striped'] }), row(3003, 'arket', { category: 't-shirt', subcategory: 'tshirt' })];

test('Swedish and English categories use whole words and longest aliases', () => {
  for (const alias of ['t-shirt', 'T‑SHIRT', 't shirt', 'tees']) assert.equal(categoryOf(alias), 't-shirt');
  assert.equal(categoryOf('steel'), null); assert.equal(categoryOf('sweatshirt'), 'sweater');
  assert.equal(categoryOf('regnjacka'), 'jacket'); assert.equal(categoryOf('rain pants'), 'pants');
});
test('multi-item search preserves compound appearance attributes', () => {
  assert.deepEqual(splitQuery('svart fleece och gröna byxor'), ['svart fleece', 'gröna byxor']);
  assert.deepEqual(splitQuery('tröja med tryck och ränder'), ['tröja med tryck och ränder']);
  assert.deepEqual(splitQuery('blue jacket, red pants and tee'), ['blue jacket', 'red pants', 'tee']);
});
test('fleece searches exclude accessories and trousers even if older data calls the material a category', () => {
  const rows = [row(1, 'arket', { category: 'fleece', name: 'Fleecejacka' }), row(2, 'pop', { category: 'fleece', name: 'Vantar fleece' }), row(3, 'minirodini', { category: 'fleece', name: 'Penguin patch mikrofleecebyxor' })];
  assert.deepEqual(searchCatalogue(rows, 'blue fleece', brands)[0].products.map(product => product.id), ['1']);
  assert.equal(categoryOf('vantar fleece'), 'accessories');
  assert.equal(categoryOf('microfleece trousers'), 'pants');
  assert.deepEqual(appearanceOf('tröja utan tryck').print_tags, []);
});
test('all stores remain eligible beyond 1000 candidates; stock and age stay hard constraints', () => {
  const unsafe = [row(9001, 'arket', { target_age_group: 'adult' }), row(9002, 'arket', { is_visible: false }), row(9003, 'arket', { in_stock: false })];
  const group = searchCatalogue([...products, ...unsafe], 'blue jacket', brands)[0];
  assert.equal(group.products.length, 8);
  assert.equal(new Set(group.products.slice(0, 3).map(product => product.store)).size, 3);
  assert.ok(group.products.every(product => !['9001', '9002', '9003'].includes(product.id) && product.color === 'blue'));
});
test('print and pattern filters are independent and absence is never inferred', () => {
  assert.deepEqual(searchCatalogue(products, 'tröja med tryck och ränder', brands)[0].products.map(product => product.id), ['3001']);
  assert.equal(searchCatalogue(products, 'randiga tröjor', brands)[0].products.length, 2);
  assert.equal(searchCatalogue(products, 'tröja utan tryck', brands)[0].products.length, 0);
  assert.equal(searchCatalogue(products, 'utan mönster', brands)[0].products.length, 0);
  assert.equal(searchCatalogue(products, 'zzxxqq', brands)[0].products.length, 0);
});
test('refresh exclusions, baby audience and explicit brands cannot be bypassed by extension', () => {
  const rows = [row(1, 'newbie'), row(2, 'arket'), row(3, 'newbie', { target_age_group: 'baby', color: 'grey' })];
  assert.equal(searchCatalogue(rows, 'Newbie blue jacket', brands, { excludeProductIds: ['1'] })[0].products.length, 0);
  const extended = searchCatalogue(rows, 'Newbie baby blue jacket', brands, { extendSearch: true })[0].products;
  assert.deepEqual(extended.map(product => product.id), ['3']);
  assert.equal(searchCatalogue(rows, 'adult jacket', brands)[0].products.length, 0);
});
test('unapproved descriptor mappings do not influence intent', () => {
  const profiles = [{ slug: 'arket', display_name: 'ARKET', aliases: [], descriptor_mappings: [{ term: 'magisk', status: 'proposed' }, { term: 'hemlig', status: 'approved' }] }];
  assert.equal(parseIntent('magisk', profiles).brand_preferences.length, 0);
  assert.equal(parseIntent('hemlig', profiles).brand_preferences.length, 0);
});
test('similarity excludes hidden, adult and same product variants; does not claim image analysis', () => {
  const rows = [row(1), row(2, 'lindex'), row(3, 'arket', { product_group_id: 'arket:1' }), row(4, 'lindex', { in_stock: false }), row(5, 'lindex', { target_age_group: 'adult' }), row(6, 'lindex', { category: 'pants' })];
  const result = similarProducts(rows, '1');
  assert.deepEqual(result.products.map(product => product.id), ['2']); assert.equal(result.imageAnalysis, false);
  assert.equal(similarProducts(rows, '4'), null);
  assert.equal(similarProducts([row(1, 'arket', { product_group_id: null }), row(2, 'lindex', { product_group_id: null })], '1').products.length, 1);
});
test('retailer variants do not crowd out different garments', () => {
  assert.equal(diverse([row(1), row(2, 'arket', { product_group_id: 'arket:1' }), row(3, 'lindex')]).length, 2);
});
test('unsafe product and image URLs are removed; privileged fields never reach clients', () => {
  for (const value of ['javascript:alert(1)', 'https://www.arket.com.evil.test/a', 'https://a:b@www.arket.com/a', 'http://www.arket.com/a', 'https://www.arket.com:8443/a']) assert.equal(safeUrl(value, ['www.arket.com']), '');
  const product = publicProduct(row(1, 'arket', { classification: { private: true }, product_url: 'javascript:alert(1)', image_url: 'https://evil.test/a' }));
  assert.equal(product.url, ''); assert.equal(product.image, ''); assert.equal(product.classification, undefined);
});
test('hearted products survive same-query refresh but cannot bypass an edited search filter', () => {
  let group = makeGroup({ category: 'jacka', sourceQuery: 'jacka', products: [row(1), row(2), row(3), row(4), row(5)] });
  group.pinned.add('2'); assert.equal(visible(group)[0].id, '2');
  group = mergeRefresh(group, { category: 'jacka', products: [row(6), row(2)] }, 'jacka');
  assert.deepEqual(group.pool.map(product => product.id), ['2', '6']);
  group = mergeRefresh(group, { products: [] }); assert.deepEqual(visible(group).map(product => product.id), ['2']);
  group = mergeRefresh(group, { category: 'blå jacka', products: [row(7)] }, 'blå jacka');
  assert.deepEqual(visible(group).map(product => product.id), ['7']); assert.equal(group.pinned.size, 0);
});
test('real archived snapshot supports all six stores and representative searches', async () => {
  const data = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url)));
  assert.equal(new Set(data.products.map(product => product.retailer)).size, 6);
  for (const query of ['jacka', 't-shirt', 'randiga tröjor', 'Newbie baby', 'svart fleece och gröna byxor']) {
    const groups = searchCatalogue(data.products, query, brands);
    assert.ok(groups.some(group => group.products.length > 0), query);
    assert.ok(groups.flatMap(group => group.products).every(product => product.url.startsWith('https://')));
  }
  assert.deepEqual(appearanceOf('randig tröja med hund tryck').pattern_tags, ['striped']);
});
