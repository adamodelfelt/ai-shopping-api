import { readFile } from 'node:fs/promises';
import { eligible } from './search.js';
import { isSnapshotPreview } from './environment.js';

const fields = 'id,name,price_sek,category,subcategory,color,material,eco,brand,retailer,image_url,product_url,product_group_id,target_age_group,is_visible,in_stock,print_tags,pattern_tags,motif_tags,decoration_tags';
let cache, cacheUntil = 0, pending;
export function readConfig(env = process.env) {
  const source = env.CATALOGUE_SOURCE ?? (env.NODE_ENV === 'production' ? 'supabase' : 'snapshot');
  if (!['snapshot', 'supabase'].includes(source)) throw new Error('Invalid catalogue source');
  if (env.NODE_ENV === 'production' && source === 'snapshot' && !isSnapshotPreview(env)) throw new Error('Snapshot catalogue is preview only');
  return source;
}
export async function fetchCatalogue({ env = process.env, fetchImpl = fetch, signal } = {}) {
  if (readConfig(env) === 'snapshot') {
    const data = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
    return { rows: data.products.filter(eligible), source: 'snapshot', updatedAt: data.updatedAt };
  }
  const url = new URL(env.SUPABASE_URL ?? '');
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.pathname !== '/') throw new Error('Invalid Supabase endpoint');
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!key?.startsWith('sb_publishable_')) throw new Error('A new publishable read key is required');
  const rows = [];
  const budget = signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000);
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const endpoint = new URL('/rest/v1/products', url);
    endpoint.search = new URLSearchParams({ select: fields, is_visible: 'eq.true', in_stock: 'eq.true', target_age_group: 'in.(kids,baby,teen)', order: 'id.asc', limit: '1000', offset: String(offset) });
    const response = await fetchImpl(endpoint, { headers: { apikey: key }, signal: budget, redirect: 'error' });
    if (!response.ok) throw new Error('Catalogue read failed');
    const page = await response.json();
    if (!Array.isArray(page) || page.length > 1000) throw new Error('Invalid catalogue response');
    rows.push(...page.filter(eligible));
    if (page.length < 1000) return { rows, source: 'live', updatedAt: new Date().toISOString() };
  }
  throw new Error('Catalogue exceeds configured safety limit');
}
export async function getCatalogue() {
  if (cache && Date.now() < cacheUntil) return cache;
  if (!pending) pending = fetchCatalogue().then(value => { cache = value; cacheUntil = Date.now() + 60_000; return value; }).finally(() => { pending = null; });
  return pending;
}
export async function getProfiles() {
  const data = JSON.parse(await readFile(new URL('../config/brand-profiles.json', import.meta.url), 'utf8'));
  return data.brands ?? [];
}
