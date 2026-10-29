import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSizingIntent, sizingForRow, bodyRows, variantFits, addSizeRecommendation, withLiveSizing } from '../lib/sizing.js';
import { garmentTable, fitEvidence, parseProductSizing, textGarmentMeasurements, linkedBodyTable, structuredProductMeasurements } from '../lib/ingestion/sizing.js';
import { splitQuery } from '../lib/search.js';
import { searchVerified } from '../lib/search-stock.js';

const row = (id, extra = {}) => ({ id: String(id), retailer: 'lindex', name: 'Byxor', category: 'pants', subcategory: 'pants', target_age_group: 'kids', is_visible: true, in_stock: true, price_sek: 249, product_url: `https://www.lindex.com/se/p/${id}-80-byxor`, ...extra });
const script = (name, data) => `<script>window.${name}=${JSON.stringify(data)}</script>`;

test('age words, numbers, double sizes and decimal body measurements remain separate constraints', () => {
  for (const text of ['byxor för smal sjuåring', 'byxor för smal 7-åring', 'byxor för smal 7 år']) {
    const intent = parseSizingIntent(text); assert.equal(intent.ageMonths, 84); assert.equal(intent.slim, true); assert.equal(intent.size, null);
  }
  assert.equal(parseSizingIntent('byxor storlek 122/128').size, '122/128');
  assert.equal(parseSizingIntent('byxor för 12 år').size, null);
  assert.equal(parseSizingIntent('trousers for a 7-year-old').ageMonths, 84);
  assert.equal(parseSizingIntent('byxor till sjuårig').ageMonths, 84);
  const intent = parseSizingIntent('byxor 122 cm lång midja 54,5 cm');
  assert.equal(intent.height, 122); assert.equal(intent.waist, 54.5); assert.equal(intent.size, null);
  assert.equal(splitQuery('byxor midja 54,5 cm')[0], 'byxor midja 54,5 cm');
});
test('six brand guides join by retailer; unknown measurements, alternative audiences and double sizes are preserved', () => {
  for (const retailer of ['arket', 'minirodini', 'pop', 'newbie', 'lindex', 'tretorn']) assert.ok(sizingForRow(row(1, { retailer })).guideUrl.startsWith('https://'));
  assert.equal(sizingForRow(row(1, { category: 'socks' })), null);
  const lindex = sizingForRow(row(1));
  assert.deepEqual(new Set(bodyRows(lindex, '122/128').map(r => r.label)), new Set(['122', '128']));
  assert.ok(bodyRows(lindex, '122/128').some(r => r.audience === 'boys' && r.label === '128' && r.measurements.waist === 59));
  assert.ok(bodyRows(lindex, '122/128').some(r => r.audience === 'girls' && r.label === '128' && r.measurements.waist === 58));
  const mini = sizingForRow(row(1, { retailer: 'minirodini' }));
  assert.equal(bodyRows(mini, '116/122')[0].measurements.waist, 57);
  assert.equal(bodyRows(mini, '122')[0].measurements.waist, undefined);
});
test('slim legs and elastic alone do not prove adjustable waist or small waist', () => {
  assert.equal(fitEvidence('Byxor med smala ben och resårmidja').adjustableWaist, false);
  assert.equal(fitEvidence('Utan justerbar midja').adjustableWaist, false);
  assert.equal(fitEvidence('Inte smal passform').slim, false);
  for (const text of ['Justerbar resårmidja', 'Justerbar midja', 'Justerbar resår och hällor i midjan', 'Adjustable elastic waist']) assert.equal(fitEvidence(text).adjustableWaist, true, text);
  assert.equal(fitEvidence('Slim fit trousers').slim, true);
});
test('half-widths stay half-widths and malformed retailer values are quarantined without correction', () => {
  const chart = garmentTable([['Size','Waist relaxed','Waist stretched','1/2 seat width','Inseam'],['122/128','27,5 cm','37 cm','40 cm','51,5 cm'],['134/140','29,5 cm','39 cm','453cm','58 cm']], { sourceUrl: 'https://se.tretorn.com/a', checkedAt: '2026-10-29T00:00:00Z', waistFlatConfirmed: true });
  assert.equal(chart.basis, 'garment'); assert.equal(chart.rows[0].measurements.waistRelaxedFlat, 27.5); assert.equal(chart.rows[0].measurements.hipFlat, 40);
  assert.equal(chart.rows[1].measurements.hipFlat, undefined); assert.equal(chart.issues.length, 1);
  const ambiguous = garmentTable([['Size','Waist relaxed','Inseam'],['122/128','27.5 cm','51.5 cm']]);
  assert.equal(ambiguous.rows[0].measurements.waistRelaxedFlat, undefined);
});
test('current product identity excludes recommendation data while allowing the same article under a new category', () => {
  const url = 'https://www.kappahl.com/sv-se/newbie/byxor/468512';
  const payload = { code: '468512', canonicalUrl: 'https://www.kappahl.com/sv-se/newbie/byxor--leggings/468512', description: 'Justerbar resårmidja', variations: [{ displayName: '122' }], sliderRecommendations: [{ description: '<table><tr><th>Size</th><th>Inseam</th></tr><tr><td>122</td><td>33 cm</td></tr></table>' }] };
  const result = parseProductSizing('newbie', script('CURRENT_PAGE', payload), url);
  assert.equal(result.fit.adjustableWaist, true); assert.equal(result.charts.length, 0);
  assert.throws(() => parseProductSizing('newbie', script('CURRENT_PAGE', payload), url.replace('468512','468513')));
});
test('actual height overrides approximate age; product garment measurements never overwrite body targets', () => {
  const product = { url: 'https://www.lindex.com/se/p/1-80-byxor', sizing: sizingForRow(row(1, { source_description: 'Justerbar midja' })) };
  assert.equal(variantFits(product, '122', parseSizingIntent('byxor 7 år')), true);
  assert.equal(variantFits(product, '92', parseSizingIntent('byxor 7 år')), false);
  assert.equal(variantFits(product, '92', parseSizingIntent('byxor 7 år 92 cm lång')), true);
  const live = withLiveSizing(product, { sourceUrl: product.url, charts: [{ rows: [{ label: '122', measurements: { waistRelaxedFlat: 25 } }] }], labels: ['122'], fit: { adjustableWaist: true } });
  const result = addSizeRecommendation(live, parseSizingIntent('byxor för smal sjuåring'), [{ label: '122' }]);
  assert.equal(result.sizeRecommendation.rows[0].garment[0].measurements.waistRelaxedFlat, 25);
  assert.equal(result.sizeRecommendation.rows[0].body[0].measurements.waist, 57);
  assert.equal(withLiveSizing(product, { sourceUrl: 'https://evil.test' }), product);
});
test('the full search returns age-appropriate verified stock with product fit evidence and keeps the size filter on extension', async () => {
  const rows = [row(1, { source_description: 'Justerbar midja' }), row(2, { source_description: 'Smal passform' }), row(3, { source_description: 'Justerbar midja' }), row(4)];
  const stock = async products => products.map(p => ({ ...p, availability: { status: 'verified', checkedAt: new Date().toISOString(), sizes: [{ id: p.id, label: p.id === '3' ? '92' : '122', available: true }] } }));
  for (const options of [{}, { extendSearch: true }]) {
    const groups = await searchVerified(rows, 'byxor för smal sjuåring', [], options, stock);
    assert.deepEqual(new Set(groups[0].products.map(p => p.id)), new Set(['1','2']));
    assert.ok(groups[0].products.every(p => p.sizeRecommendation.labels.includes('122')));
  }
});
test('catalogue joins use stable product URLs and measured Tretorn rows are kept separate from generic age guidance', async () => {
  const products = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url))).products;
  const north = products.find(p => p.product_url === 'https://se.tretorn.com/north-micro-fleece-trousers-800986059');
  const sizing = sizingForRow(north);
  assert.ok(sizing.productCharts.some(c => c.basis === 'garment'));
  assert.ok(sizing.bodyCharts.every(c => c.rows.every(r => r.measurements.waist === undefined)));
});
test('product-linked body guidance replaces the general target for the same size without replacing garment dimensions', () => {
  const product = { url: 'https://www.polarnopyret.se/barnklader/a-60600000-1000', sizing: sizingForRow(row(1, { retailer: 'pop' })) };
  const linked = linkedBodyTable([['Ålder','Längd (A)','Bröstvidd','Midjevidd','Stussvidd','Benlängd'],['6-7 år','122','64','58','66','55']], product.url, '2026-10-29T00:00:00Z');
  const updated = withLiveSizing(product, { sourceUrl: product.url, linkedBodyCharts: [linked], charts: [], labels: ['122'], fit: {} });
  assert.equal(bodyRows(updated.sizing,'122').length,1);
  assert.equal(bodyRows(updated.sizing,'122')[0].measurements.waist,58);
  assert.equal(bodyRows(updated.sizing,'128')[0].measurements.waist,59);
  const baby = linkedBodyTable([['Storlek','Månader','Bröstvidd','Midjevidd'],['62','2–4','42,5','41,5']], product.url, '2026-10-29T00:00:00Z');
  assert.deepEqual(baby.rows[0].ageMonths,[2,4]);
});
test('text measurements require explicit garment dimension and size; model height cannot become an inseam', () => {
  assert.equal(textGarmentMeasurements('Modellen är 128 cm lång och bär storlek 116/122.', ['116/122']), null);
  const chart = textGarmentMeasurements('Innerbensmått 54,5 cm i storlek 122', ['116','122']);
  assert.deepEqual(chart.rows,[{label:'122',measurements:{inseam:54.5}}]);
  assert.equal(textGarmentMeasurements('Innerbensmått 54,5 cm', ['122']), null);
});
test('a product waist measurement enables comparison only for the measured and age-appropriate variant', () => {
  const product = { sizing: sizingForRow(row(1)) };
  product.sizing.productCharts = [{basis:'garment',rows:[{label:'122',measurements:{waistRelaxedFlat:25}}]}];
  assert.equal(variantFits(product,'122',parseSizingIntent('byxor för smal sjuåring')),true);
  assert.equal(variantFits(product,'128',parseSizingIntent('byxor för smal sjuåring')),false);
});
test('a retailer product length applies to a single-size accessory and is never copied to all clothing sizes', () => {
  const chart = structuredProductMeasurements({length:'78.0 cm'},['0'],'https://www.lindex.com/se/p/3013172-6950-rosa-scarf-i-fuskpals');
  assert.deepEqual(chart.rows,[{label:'0',measurements:{length:78}}]);
  assert.equal(structuredProductMeasurements({length:'78.0 cm'},['122','128']),null);
  assert.equal(structuredProductMeasurements({length:'78.0'},['0']),null);
});
