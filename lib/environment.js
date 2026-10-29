// A hosted snapshot is permitted only on Vercel's Preview environment.
// Production must still use a live catalogue and a shared quota.
export function isSnapshotPreview(env = process.env) {
  return env.VERCEL === '1' && env.VERCEL_ENV === 'preview' && env.CATALOGUE_SOURCE === 'snapshot';
}
export function deploymentOrigin(env = process.env) {
  if (env.VERCEL !== '1' || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL ?? '')) return null;
  return `https://${env.VERCEL_URL}`;
}
