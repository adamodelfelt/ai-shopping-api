import { readFile, writeFile, rename } from 'node:fs/promises';
import { fitEvidence } from '../lib/fit-evidence.js';
import { garmentTable, textGarmentMeasurements, structuredProductMeasurements } from '../lib/ingestion/sizing.js';
import { pathToFileURL } from 'node:url';

// Run after collection, never concurrently with sizing-audit.js.
const root = new URL('../', import.meta.url), target = new URL('config/product-sizing.json', root);
const saved = JSON.parse(await readFile(target, 'utf8'));
for (const arg of process.argv.filter(arg => arg.startsWith('--merge='))) {
  const imported = JSON.parse(await readFile(pathToFileURL(arg.slice(8)), 'utf8'));
  for (const [url, record] of Object.entries(imported.products)) if (!saved.products[url] || Date.parse(record.checkedAt) >= Date.parse(saved.products[url].checkedAt)) saved.products[url] = record;
}
for (const record of Object.values(saved.products)) {
  record.fit = fitEvidence(record.fit.sourceText);
  if (record.sourceTables && record.sourceUrl.startsWith('https://se.tretorn.com/')) record.charts = record.sourceTables.map(table => garmentTable(table, { sourceUrl: record.sourceUrl, checkedAt: record.checkedAt, waistFlatConfirmed: record.waistFlatConfirmed })).filter(Boolean);
  const textChart = textGarmentMeasurements(record.fit.sourceText, record.labels, record.sourceUrl, record.checkedAt);
  if (textChart && !record.charts.some(chart => chart.method === textChart.method)) record.charts.push(textChart);
  const structured = record.sourceUrl.startsWith('https://www.lindex.com/') ? structuredProductMeasurements(record.unparsedMeasurements, record.labels, record.sourceUrl, record.checkedAt) : null;
  if (structured) { record.charts.push(structured); record.sourceMeasurements = record.unparsedMeasurements; delete record.unparsedMeasurements; }
  if (record.charts.length) record.status = 'product_measurements';
}
await writeFile(new URL('config/product-sizing.json.tmp', root), JSON.stringify(saved, null, 2) + '\n');
await rename(new URL('config/product-sizing.json.tmp', root), target);
const catalogue = JSON.parse(await readFile(new URL('data/catalogue.json', root), 'utf8'));
const reportPath = new URL('research/sizing-audit.json', root);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
report.finalizedAt = new Date().toISOString();
for (const store of new Set(catalogue.products.map(row => row.retailer))) {
  const rows = catalogue.products.filter(row => row.retailer === store);
  const records = rows.map(row => saved.products[row.product_url]).filter(Boolean);
  report.stores[store] = { ...report.stores[store], coverage: {
    catalogueProducts: rows.length, productPagesVerified: records.length, unchecked: rows.length - records.length,
    productsWithGarmentMeasurements: records.filter(record => record.charts.length).length,
    productsWithLinkedBodyGuide: records.filter(record => record.linkedBodyCharts?.length).length,
    adjustableWaist: records.filter(record => record.fit.adjustableWaist).length,
    slimFit: records.filter(record => record.fit.slim).length,
    invalidMeasurements: records.flatMap(record => record.charts.flatMap(chart => chart.issues)).length,
    measurementsNeedingReview: records.filter(record => record.status === 'measurements_need_review').length,
  } };
  report.stores[store].withMeasurements = report.stores[store].coverage.productsWithGarmentMeasurements;
  report.stores[store].withFitEvidence = records.filter(record => record.fit.adjustableWaist || record.fit.slim).length;
  report.stores[store].issues = report.stores[store].coverage.invalidMeasurements;
}
report.complete = Object.values(report.stores).every(store => store.coverage.unchecked === 0);
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.stores).map(([store,value]) => [store,value.coverage])), null, 2));
