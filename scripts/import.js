import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { adminClient, allRows, backup, loadEnv } from './admin-client.js';
import { validateProduct } from '../lib/ingestion/model.js';

export function importPlan(snapshot, existing) {
  if (snapshot.complete !== true || !Array.isArray(snapshot.products) || !snapshot.products.length || snapshot.products.length > 10_000) throw new Error('Only complete, nonempty, validated scrape runs may be imported');
  const existingByUrl = new Map(existing.map(row => [row.product_url, row]));
  const seen = new Set();
  const rows = snapshot.products.map(product => {
    const row = validateProduct(product);
    if (row.retailer !== snapshot.store || seen.has(row.product_url)) throw new Error('Mixed retailers or duplicate product URL');
    seen.add(row.product_url);
    const previous = existingByUrl.get(row.product_url);
    // Keep classification immutable when already reviewed, even without a database trigger.
    if (previous?.classification?.review_state === 'reviewed') for (const key of ['category', 'subcategory', 'print_tags', 'pattern_tags', 'motif_tags', 'decoration_tags', 'classification']) row[key] = previous[key];
    return row;
  });
  const oldRows = existing.filter(row => row.retailer === snapshot.store || snapshot.store === 'pop' && /polarn/i.test(row.retailer));
  if (oldRows.length > 50 && rows.length < oldRows.length / 2) throw new Error('Catalogue shrank by over half; manual review required');
  return { rows, creates: rows.filter(row => !existingByUrl.has(row.product_url)).length, updates: rows.filter(row => existingByUrl.has(row.product_url)).length, untouched: oldRows.filter(row => !seen.has(row.product_url)).length };
}
export async function main(args = process.argv.slice(2)) {
  const file = args.find(value => !value.startsWith('--'));
  if (!file) throw new Error('Usage: npm run catalogue:import -- data/runs/<store>.json [--apply]');
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  await loadEnv(); const client = adminClient();
  const existing = await allRows(client, 'products');
  const plan = importPlan(snapshot, existing);
  console.log(JSON.stringify({ creates: plan.creates, updates: plan.updates, missingLeftUntouched: plan.untouched, apply: args.includes('--apply') }));
  if (!args.includes('--apply')) return;
  await backup('before-import', existing);
  // One statement: PostgreSQL applies the whole upsert atomically, including classification triggers.
  await client('products', { on_conflict: 'product_url' }, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(plan.rows) });
  const after = new Map((await allRows(client, 'products')).map(row => [row.product_url, row]));
  for (const row of plan.rows) if (!after.has(row.product_url) || Number(after.get(row.product_url).price_sek) !== row.price_sek || after.get(row.product_url).in_stock !== row.in_stock) throw new Error('Post-import verification failed; inspect the local backup');
  console.log(`Verified ${plan.rows.length} imported products.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Import failed; credentials and provider details withheld. Check inputs and configuration.'); process.exitCode = 1; });
