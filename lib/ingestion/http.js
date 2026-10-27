import { setTimeout as delay } from 'node:timers/promises';

export function robotsAllows(text, address, agent = 'Whool') {
  const groups = []; let current;
  for (const line of text.split(/\r?\n/)) {
    const match = line.split('#')[0].trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && ['allow', 'disallow'].includes(key) && value) current.rules.push({ allow: key === 'allow', path: value });
  }
  const matches = groups.map(group => ({ ...group, priority: Math.max(-1, ...group.agents.map(value => value === '*' ? 0 : agent.toLowerCase().startsWith(value) ? value.length : -1)) }));
  const priority = Math.max(-1, ...matches.map(group => group.priority));
  const path = new URL(address).pathname + new URL(address).search;
  const rules = matches.filter(group => group.priority === priority && priority >= 0).flatMap(group => group.rules).filter(rule => {
    const pattern = rule.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
    return new RegExp(`^${pattern}`).test(path);
  }).sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}
export async function readTextBounded(response, maxBytes = 8 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Retailer response exceeds safety limit'); }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length; if (bytes > maxBytes) throw new Error('Retailer response exceeds safety limit'); chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function retailerClient(origin, { fetchImpl = fetch, sleep = delay, interval = 1100, signal, timeout = 25_000, attempts = 3 } = {}) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.port) throw new Error('Invalid retailer origin');
  let last = 0;
  async function load(address, robots = false) {
    const url = new URL(address);
    if (url.origin !== base.origin || url.username || url.password) throw new Error('Unexpected retailer host');
    for (let attempt = 0; attempt < attempts; attempt++) {
      await sleep(Math.max(0, interval - (Date.now() - last))); last = Date.now();
      const response = await fetchImpl(url, { redirect: 'error', headers: { 'user-agent': 'Whool/2.0', 'accept-language': 'sv-SE,sv;q=0.9' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
      if (robots && response.status === 404) return '';
      if (response.ok) return readTextBounded(response);
      await response.body?.cancel();
      if (![429, 502, 503, 504].includes(response.status) || attempt === attempts - 1) throw new Error(`Retailer request stopped (HTTP ${response.status})`);
      const header = response.headers.get('retry-after');
      const wait = Math.max(2000 * 2 ** attempt, header && /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now()) || 0);
      if (wait > 60_000) throw new Error('Retailer requested a longer cooldown; run stopped');
      await sleep(wait);
    }
  }
  const robots = await load(new URL('/robots.txt', base), true);
  return address => {
    if (!robotsAllows(robots, address)) throw new Error('Retailer robots.txt disallows this URL');
    return load(address);
  };
}
