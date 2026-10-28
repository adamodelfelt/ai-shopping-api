import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseIntent, searchCatalogue, matchesIntent, splitQuery } from '../lib/search.js';
import { productColor, colorTone, playfulEvidence } from '../lib/taxonomy.js';

const row = (id, extra = {}) => ({ id: String(id), name: 'Tröja', category: 'sweater', retailer: 'pop', brand: 'Polarn O. Pyret', color: 'red', price_sek: 249, is_visible: true, in_stock: true, target_age_group: 'kids', product_url: `https://www.polarnopyret.se/barnklader/troja-${id}`, ...extra });

test('the reviewed brown garments never enter red or burgundy searches', () => {
  for (const id of ['3870861906659172', '191482575054251']) {
    const product = row(id, { name: 'Byxor vinröd', category: 'pants' });
    assert.equal(productColor(product), 'brown'); assert.equal(colorTone(product), 'brown');
    assert.equal(matchesIntent(product, parseIntent('röda byxor')), false);
    assert.equal(matchesIntent(product, parseIntent('vinröda byxor')), false);
    assert.equal(matchesIntent(product, parseIntent('bruna byxor')), true);
  }
});
test('täckbrallor remains its own group and means outdoor/shell trousers', () => {
  assert.deepEqual(splitQuery('röda byxor, täckbrallor, rolig tröja'), ['röda byxor', 'täckbrallor', 'rolig tröja']);
  for (const term of ['täckbrallor', 'täckbyxor', 'täckbralla', 'täckbyxa']) {
    const intent = parseIntent(term); assert.equal(intent.category, 'pants'); assert.equal(intent.subcategory, 'shell-pants');
    assert.equal(matchesIntent(row(1, { category: 'pants', name: 'Vattentät vadderad byxa SNOWY' }), intent), true);
    assert.equal(matchesIntent(row(2, { category: 'pants', name: 'Jeans' }), intent), false);
  }
});
test('fun tops accept stripes, patterns, prints and motifs across brands while blank and Christmas tops are excluded', () => {
  const rows = [row(1, { name: 'Randig tröja', pattern_tags: ['striped'] }), row(2, { category: 't-shirt', name: 'Table Tennis Print T-Shirt', retailer: 'minirodini', print_tags: ['printed'] }), row(3, { category: 't-shirt', name: 'Play T-Shirt', retailer: 'minirodini' }), row(4, { name: 'T-shirt i slubtrikå med ficka', category: 't-shirt', retailer: 'newbie' }), row(5, { name: 'Enkel marinblå t-shirt', category: 't-shirt' }), row(6, { name: 'Långärmad t-shirt jul', category: 't-shirt', print_tags: ['printed'] }), row(7, { name: 'Tröja med taxar', motif_tags: ['dog'] })];
  for (const term of ['rolig tröja', 'roliga tröjor', 'lekfull tröja', 'kul tröja']) {
    const ids = searchCatalogue(rows, term)[0].products.map(product => product.id);
    assert.deepEqual(new Set(ids), new Set(['1', '2', '3', '7']));
  }
  assert.deepEqual(searchCatalogue(rows, 'rolig jultröja')[0].products.map(product => product.id), ['6']);
  assert.deepEqual(searchCatalogue(rows, 'jultröja')[0].products.map(product => product.id), ['6']);
  assert.equal(playfulEvidence(row(8, { name: 'Enfärgad tröja utan tryck', print_tags: ['printed'] })).score, 0);
  const brands = [{ slug: 'newbie', display_name: 'Newbie', descriptor_mappings: [{ term: 'rolig', status: 'approved', reviewed_by: 'owner', reviewed_at: '2026-10-27', weight: 3 }] }];
  assert.equal(searchCatalogue([rows[3]], 'rolig tröja', brands)[0].products.length, 0);
});
test('the actual three-part query preserves all groups and the owner-approved striped option', async () => {
  const rows = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url))).products.filter(row => row.retailer !== 'arket');
  const groups = searchCatalogue(rows, 'röda byxor, täckbrallor, rolig tröja', [], { candidateLimit: 32 });
  assert.equal(groups.length, 3); assert.ok(groups.every(group => group.products.length));
  assert.ok(groups[0].products.every(product => product.color === 'red' && !['3870861906659172', '191482575054251'].includes(product.id)));
  assert.ok(groups[2].products.some(product => product.store === 'pop' && product.appearance.patterns.includes('striped')));
  assert.ok(groups[2].products.every(product => product.playfulReason));
  assert.ok(!groups[2].products.some(product => ['155915834140489', '221704869215963'].includes(product.id)));
});
test('dotted tops count as playful, with an explicit dotted reason', () => {
  const dotted = row(101, { name: 'Sweatshirt prickig', pattern_tags: ['dotted'] });
  const blank = row(102, { name: 'Enfärgad sweatshirt' });
  assert.deepEqual(playfulEvidence(dotted), { score: 2, reason: 'Prickigt' });
  assert.deepEqual(searchCatalogue([blank, dotted], 'rolig tröja')[0].products.map(product => product.id), ['101']);
});
