import { createHash } from 'node:crypto';

const fields = ['name','category','subcategory','brand','retailer','product_url','image_url','product_group_id','price_sek','in_stock','target_age_group','target_gender','color','material','source_description','source_pattern','size','eco','print_tags','pattern_tags','motif_tags','decoration_tags','classification','wear_context','sport_activities','usage_category','usage_classification'];
export function stagingPlan(snapshot, { maxProducts = 50 } = {}) {
  if (!snapshot || typeof snapshot.store !== 'string' || !Array.isArray(snapshot.products) || !snapshot.products.length) throw new Error('Nonempty scrape snapshot required');
  if (!Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > 2000 || snapshot.products.length > maxProducts) throw new Error('Batch exceeds review limit; split or explicitly configure a reviewed batch size');
  const collectedAt = snapshot.collectedAt;
  if (!Number.isFinite(Date.parse(collectedAt)) || Date.parse(collectedAt) > Date.now() + 300_000) throw new Error('Valid collection timestamp required');
  return {
    p_run: { retailer: snapshot.store, collected_at: collectedAt, complete: snapshot.complete === true, scope: snapshot.scope ?? 'unspecified; review required', expected_count: snapshot.expected ?? null, max_products: maxProducts, parser_version: snapshot.parserVersion ?? 'whool-2-review-1' },
    p_items: snapshot.products.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Product evidence must be an object');
      const proposal = raw.proposed_product ?? raw;
      // Keep unknown evidence in raw_data; do not send unrecognized columns to products.
      const proposed = Object.fromEntries(fields.filter(key => proposal[key] !== undefined).map(key => [key, proposal[key]]));
      proposed.retailer = proposal.retailer ?? snapshot.store;
      return { source_key: String(raw.source_key ?? proposed.product_url ?? createHash('sha256').update(JSON.stringify(raw)).digest('hex')), source_url: raw.source_url ?? proposed.product_url ?? null, raw_data: raw.raw_data ?? raw, proposed_product: proposed };
    }),
  };
}
export async function stageSnapshot(snapshot, client, options) {
  const plan = stagingPlan(snapshot, options);
  const result = await client('rpc/stage_scrape', {}, { method: 'POST', body: JSON.stringify(plan) });
  if (!result?.run_id || result.published !== 0 || result.staged + result.duplicates !== plan.p_items.length) throw new Error('Staging verification failed');
  return result;
}
