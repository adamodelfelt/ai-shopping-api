import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStockService, validStock } from '../lib/stock.js';
import { publicProduct } from '../lib/links.js';
import { searchCatalogue, eligible } from '../lib/search.js';
import { demoRetailerAllowed } from '../public/retailers.js';
import { storeSlug } from '../lib/links.js';

export async function main(args = process.argv.slice(2)) {
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const limit = Number(option('--limit') ?? 24), query = option('--query');
  if (!Number.isInteger(limit) || limit < 1 || limit > 4000) throw new Error('Choose a limit between 1 and 4000');
  const catalogue = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
  const profiles = JSON.parse(await readFile(new URL('../config/brand-profiles.json', import.meta.url), 'utf8')).brands ?? [];
  const assortment = catalogue.products.filter(row => demoRetailerAllowed(storeSlug(row.retailer)));
  const selected = query ? searchCatalogue(assortment, query, profiles).flatMap(group => group.products) : assortment.filter(eligible).map(publicProduct);
  const products = [...new Map(selected.map(product => [product.id, product])).values()].slice(0, limit);
  const verify = createStockService({ disk: false }), results = [];
  for (let i = 0; i < products.length; i += 24) {
    const checked = await verify(products.slice(i, i + 24)); results.push(...checked);
    console.log(JSON.stringify({ checked: results.length, total: products.length, verified: results.filter(product => product.availability.status === 'verified').length, unavailable: results.filter(product => product.availability.status === 'unavailable').length, unknown: results.filter(product => product.availability.status === 'unknown').length }));
  }
  const file = new URL('../data/stock.json', import.meta.url), temp = new URL('../data/stock.json.tmp', import.meta.url);
  let previous = {}; try { previous = JSON.parse(await readFile(file, 'utf8')).products ?? {}; } catch { /* First run. */ }
  const entries = Object.fromEntries(Object.entries(previous).filter(([, value]) => validStock(value)));
  for (const product of results) entries[product.url] = product.availability;
  await writeFile(temp, JSON.stringify({ updatedAt: new Date().toISOString(), products: entries }, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, file);
  console.log(`Saved stock evidence: ${fileURLToPath(file)}. Unknown stock is never treated as available.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Stock check stopped; no complete new evidence file published.'); process.exitCode = 1; });
