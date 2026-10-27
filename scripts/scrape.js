import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { stores, collect } from '../lib/ingestion/collect.js';
import { retailerClient } from '../lib/ingestion/http.js';
import { main as importSnapshot } from './import.js';

async function main() {
  const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const requested = option('--store') ?? 'all';
  const selected = requested === 'all' ? Object.keys(stores) : [requested];
  if (selected.some(store => !stores[store])) throw new Error('Choose arket, minirodini, pop, newbie, lindex, tretorn or all');
  const limit = Number(option('--limit') ?? 10_000);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error('Invalid product limit');
  const directory = new URL(`../data/runs/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  let failures = 0;
  for (const store of selected) {
    try {
      const get = await retailerClient(stores[store].origin);
      const result = await collect(store, get, { limit });
      const file = new URL(`${store}.json`, directory);
      await writeFile(file, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      console.log(JSON.stringify({ store, complete: result.complete, products: result.products.length, pages: result.pages }));
      if (args.includes('--import')) {
        if (!result.complete) throw new Error('A limited run cannot be imported');
        await importSnapshot([fileURLToPath(file), '--apply']);
      }
    } catch (error) {
      failures++;
      // Never persist provider error bodies or environment values.
      await writeFile(new URL(`${store}-failed.json`, directory), JSON.stringify({ store, complete: false, error: 'Collection or import stopped; review access, parser fixtures, coverage and configuration.' }) + '\n', { mode: 0o600 });
      console.error(`${store}: stopped safely; no complete new snapshot published`);
    }
  }
  if (failures) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Invalid scraper configuration.'); process.exitCode = 1; });
