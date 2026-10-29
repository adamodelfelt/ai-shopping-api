import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { retailerClient } from '../lib/ingestion/http.js';
import { parseProductSizing, fitEvidence } from '../lib/ingestion/sizing.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const catalogue = JSON.parse(await readFile(new URL('data/catalogue.json', root), 'utf8'));
const outputArg = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const target = outputArg ? pathToFileURL(resolve(fileURLToPath(root), outputArg)) : new URL('config/product-sizing.json', root);
const saved = await readFile(target, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return { version: 1, products: {} }; throw error; });
const report = { checkedAt: new Date().toISOString(), catalogueCount: catalogue.products.length, stores: {} };
const requested = process.argv.find(arg => arg.startsWith('--store='))?.split('=')[1];
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? Infinity);
const minimumParser = Number(process.argv.find(arg => arg.startsWith('--min-parser-version='))?.split('=')[1] ?? 5);
const origins = { arket: 'https://www.arket.com', minirodini: 'https://www.minirodini.com', pop: 'https://www.polarnopyret.se', newbie: 'https://www.kappahl.com', lindex: 'https://www.lindex.com', tretorn: 'https://se.tretorn.com' };
if (requested && !Object.hasOwn(origins, requested)) throw new Error('Unknown retailer');
if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) throw new Error('Invalid product limit');
if (!Number.isInteger(minimumParser) || minimumParser < 1 || minimumParser > 5) throw new Error('Invalid parser version');
if (!outputArg) {
  const previous = await readFile(new URL('research/sizing-audit.json', root), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (requested && previous?.catalogueCount === report.catalogueCount) report.stores = previous.stores;
}
// Queue writes so independent stores cannot overwrite each other's progress.
let writes = Promise.resolve();
function save() {
  writes = writes.then(async () => {
    await writeFile(new URL(target.href + '.tmp'), JSON.stringify(saved, null, 2) + '\n');
    await rename(new URL(target.href + '.tmp'), target);
    await mkdir(new URL('research/', root), { recursive: true });
    await writeFile(outputArg ? new URL(target.href + '.audit.json') : new URL('research/sizing-audit.json', root), JSON.stringify(report, null, 2) + '\n');
  });
  return writes;
}
await Promise.all(Object.entries(origins).filter(([store]) => !requested || requested === store).map(async ([store, origin]) => {
  const rows = catalogue.products.filter(row => row.retailer === store);
  const result = report.stores[store] = { products: rows.length, descriptionsScanned: rows.length, completed: 0, cached: 0, blocked: 0, failures: 0, failureReasons: {}, withMeasurements: 0, withFitEvidence: 0, issues: 0 };
  let get;
  try { get = await retailerClient(origin, { timeout: 12000, attempts: 1 }); }
  catch (error) { result.stopReason = error.message; result.blocked = rows.length; await save(); return; }
  for (const [index, row] of rows.entries()) {
    const prior = saved.products[row.product_url];
    if (!process.argv.includes('--force') && prior?.parserVersion >= minimumParser && Date.now() - Date.parse(prior.checkedAt) < 24 * 60 * 60 * 1000) { result.cached++; continue; }
    if (result.completed >= limit) { result.stopReason = 'requested_limit'; break; }
    try {
      const record = parseProductSizing(store, await get(row.product_url), row.product_url);
      saved.products[row.product_url] = record;
      result.completed++;
      if (record.charts.length) result.withMeasurements++;
      if (record.fit.adjustableWaist || record.fit.slim) result.withFitEvidence++;
      result.issues += record.charts.reduce((sum, chart) => sum + chart.issues.length, 0);
    } catch (error) {
      result.failures++;
      const reason = error.message.slice(0, 180); result.failureReasons[reason] = (result.failureReasons[reason] ?? 0) + 1;
      if (/403|429|robots.txt|parser not verified/.test(error.message)) { result.stopReason = error.message; result.blocked = rows.length - index; break; }
    }
    if (index % 10 === 0) await save();
  }
  const localFit = rows.filter(row => { const evidence = fitEvidence(`${row.name} ${row.source_description ?? ''}`); return evidence.adjustableWaist || evidence.slim; }).length;
  result.localFitEvidence = localFit;
  console.log(JSON.stringify({ store, ...result })); await save();
}));
await save();
