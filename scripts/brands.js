import { readFile } from 'node:fs/promises';
import { adminClient, allRows, backup, loadEnv } from './admin-client.js';
export function validateProfiles(data) {
  if (!Array.isArray(data.brands)) throw new Error('Missing profiles');
  const slugs = new Set();
  for (const brand of data.brands) {
    if (!/^[a-z0-9-]{1,40}$/.test(brand.slug) || slugs.has(brand.slug) || !Number.isInteger(brand.version) || brand.version < 1 || typeof brand.display_name !== 'string' || !Array.isArray(brand.aliases) || !Array.isArray(brand.descriptor_mappings)) throw new Error('Invalid profile');
    slugs.add(brand.slug);
    for (const mapping of brand.descriptor_mappings) if (!['draft', 'proposed', 'approved', 'rejected'].includes(mapping.status) || typeof mapping.term !== 'string' || !mapping.term.trim() || mapping.status === 'approved' && (!mapping.reviewed_by || !Number.isFinite(Date.parse(mapping.reviewed_at)))) throw new Error('Unreviewed approval');
  }
  return data.brands;
}
const profiles = validateProfiles(JSON.parse(await readFile(new URL('../config/brand-profiles.json', import.meta.url), 'utf8')));
console.log(`Validated ${profiles.length} profiles. The web deployment reads this versioned file.`);
if (process.argv.includes('--import')) {
  await loadEnv(); const client = adminClient(), existing = await allRows(client, 'brand_profiles');
  if (existing.some(old => profiles.find(row => row.slug === old.slug)?.version < old.version)) throw new Error('Profile version downgrade refused');
  await backup('before-brand-sync', existing);
  const rows = profiles.map(({ slug, display_name, aliases, descriptor_mappings, version }) => ({ slug, display_name, aliases, descriptor_mappings, version }));
  await client('brand_profiles', { on_conflict: 'slug' }, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  const after = await allRows(client, 'brand_profiles');
  if (rows.some(row => !after.some(saved => saved.slug === row.slug && saved.version === row.version))) throw new Error('Brand sync verification failed');
  console.log('Brand profiles synchronized and verified. Redeploy web code to publish profile changes.');
}
