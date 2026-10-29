import { mkdir, writeFile } from 'node:fs/promises';
export async function loadEnv() {
  try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function adminClient(env = process.env, fetchImpl = fetch) {
  const base = new URL(env.SUPABASE_URL ?? '');
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || base.username || base.password || base.pathname !== '/') throw new Error('Invalid Supabase endpoint');
  const key = env.SUPABASE_IMPORT_SECRET_KEY;
  if (!key?.startsWith('sb_secret_')) throw new Error('Use a newly created SUPABASE_IMPORT_SECRET_KEY, never the archived legacy key');
  return async (table, params = {}, options = {}) => {
    if (!['products', 'brand_profiles'].includes(table)) throw new Error('Unsupported maintenance table');
    const url = new URL(`/rest/v1/${table}`, base); url.search = new URLSearchParams(params);
    const response = await fetchImpl(url, { ...options, headers: { apikey: key, 'content-type': 'application/json', ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Maintenance request failed (HTTP ${response.status}); provider body withheld`);
    return response.status === 204 ? null : response.json();
  };
}
export async function allRows(client, table, extra = {}) {
  const rows = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const page = await client(table, { select: '*', order: table === 'products' ? 'id.asc' : 'slug.asc', limit: '1000', offset: String(offset), ...extra });
    if (!Array.isArray(page)) throw new Error('Invalid maintenance response');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error('Maintenance safety limit exceeded');
}
export async function backup(name, data) {
  const directory = new URL('../data/backups/', import.meta.url); await mkdir(directory, { recursive: true });
  const target = new URL(`${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.json`, directory);
  await writeFile(target, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return target;
}
