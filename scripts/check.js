import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
let count = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'data', 'test'].includes(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) { await scan(url); continue; }
    if (!/\.(?:js|json|html|css|yml|md)$/.test(entry.name)) continue;
    const text = await readFile(url, 'utf8');
    if (entry.name.endsWith('.js')) {
      const check = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { encoding: 'utf8' });
      if (check.status !== 0) throw new Error(check.stderr);
    }
    if (entry.name.endsWith('.json')) JSON.parse(text);
    if (/(?:sk-proj-[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.test(text)) throw new Error(`Possible secret in ${entry.name}; values withheld`);
    if (url.pathname.includes('/public/') && /(?:innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function\(|sessionStorage)/.test(text)) throw new Error(`Unsafe browser primitive in ${entry.name}`);
    if (url.pathname.includes('/public/') && /localStorage/.test(text) && !url.pathname.endsWith('/public/favorites-storage.js')) throw new Error(`Persistent storage must use the public favorite-ID adapter: ${entry.name}`);
    count++;
  }
}
await scan(root);
console.log(`Syntax, JSON and source safety checks passed (${count} files).`);
