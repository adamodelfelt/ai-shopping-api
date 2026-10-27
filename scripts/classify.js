import { pathToFileURL } from 'node:url';
import { adminClient, allRows, backup, loadEnv } from './admin-client.js';
import { appearanceOf } from '../lib/taxonomy.js';
import { classifyName } from '../lib/ingestion/model.js';
export function classificationPlan(rows) {
  return rows.filter(row => row.classification?.review_state !== 'reviewed').map(row => {
    const type = classifyName(row.name);
    return { id: row.id, category: type.category ?? row.category, subcategory: type.subcategory ?? row.subcategory, ...appearanceOf(`${row.name} ${row.source_description ?? ''} ${row.source_pattern ?? ''}`), classification: { version: 'whool-2', review_state: 'unreviewed', unknown_axes: ['absence_of_print', 'absence_of_pattern'] } };
  }).filter(change => {
    const before = rows.find(row => row.id === change.id);
    return Object.keys(change).some(key => key !== 'id' && JSON.stringify(before[key]) !== JSON.stringify(change[key]));
  });
}
export async function main(args = process.argv.slice(2)) {
  await loadEnv(); const client = adminClient(), before = await allRows(client, 'products');
  const plan = classificationPlan(before); await backup('classification-plan', plan);
  console.log(JSON.stringify({ changes: plan.length, reviewedSkipped: before.filter(row => row.classification?.review_state === 'reviewed').length, apply: args.includes('--apply') }));
  if (!args.includes('--apply')) return;
  await backup('before-classification', before);
  for (const change of plan) {
    const { id, ...body } = change;
    await client('products', { id: `eq.${id}`, 'classification->>review_state': 'neq.reviewed' }, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  }
  const after = new Map((await allRows(client, 'products')).map(row => [String(row.id), row]));
  for (const change of plan) {
    const row = after.get(String(change.id));
    if (row?.classification?.review_state === 'reviewed') continue;
    if (!row || ['category', 'subcategory', 'print_tags', 'pattern_tags', 'motif_tags', 'decoration_tags'].some(axis => JSON.stringify(row[axis]) !== JSON.stringify(change[axis]))) throw new Error('Classification verification failed');
  }
  console.log('Classification verified. Price, visibility and stock were not modified.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Classification failed; check the ignored local plan and backup.'); process.exitCode = 1; });
