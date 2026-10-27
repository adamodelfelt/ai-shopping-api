import { readFile } from 'node:fs/promises';
import { retailerClient } from './ingestion/http.js';
import { parseStock } from './ingestion/stock.js';
import { safeUrl, retailerHosts } from './links.js';
import { stockFresh, STOCK_TTL } from '../public/availability.js';
import { demoRetailerAllowed } from '../public/retailers.js';

const origins = { arket: 'https://www.arket.com', minirodini: 'https://www.minirodini.com', pop: 'https://www.polarnopyret.se', newbie: 'https://www.kappahl.com', lindex: 'https://www.lindex.com', tretorn: 'https://se.tretorn.com' };
export function validStock(value, now = Date.now()) {
  if (!value || !['verified', 'unavailable', 'unknown'].includes(value.status)) return false;
  const age = now - Date.parse(value.checkedAt);
  if (!Number.isFinite(age) || age < -5000 || age >= (value.status === 'unknown' ? 30_000 : STOCK_TTL)) return false;
  if (value.status === 'unknown') return Array.isArray(value.sizes) && value.sizes.length === 0;
  return Number.isFinite(value.price) && value.price >= 0 && value.price <= 100_000 && Array.isArray(value.sizes) && value.sizes.length > 0 && value.sizes.length <= 100 && new Set(value.sizes.map(size => size.id)).size === value.sizes.length && value.sizes.every(size => typeof size.id === 'string' && size.id.length > 0 && size.id.length <= 100 && typeof size.label === 'string' && size.label.length > 0 && size.label.length <= 30 && typeof size.available === 'boolean' && Number.isFinite(size.price) && size.price >= 0 && size.price <= 100_000 && (size.quantity === undefined || Number.isInteger(size.quantity) && size.quantity >= 0)) && (value.status === 'verified') === value.sizes.some(size => size.available);
}
function failureReason(error) {
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return 'timeout';
  const status = /^Retailer request stopped \(HTTP (\d{3})\)$/.exec(error?.message ?? '');
  if (status) return `http_${status[1]}`;
  if (error?.message === 'Retailer robots.txt disallows this URL') return 'robots_disallowed';
  if (error?.message === 'fetch failed') return 'network';
  return 'unverified_response';
}
export function createStockService({ fetchImpl = fetch, now = Date.now, disk = true, interval = 1100, reportFailure = entry => console.warn(JSON.stringify(entry)) } = {}) {
  const cache = new Map(), pending = new Map(), queues = new Map(), cooldowns = new Map();
  async function check(product, signal, clients) {
    const url = safeUrl(product.url, retailerHosts[product.store] ?? []);
    const unknown = () => ({ status: 'unknown', checkedAt: new Date(now()).toISOString(), sizes: [] });
    if (!url || !demoRetailerAllowed(product.store)) return unknown();
    if (validStock(cache.get(url), now())) return cache.get(url);
    if (pending.has(url)) return pending.get(url);
    if ((cooldowns.get(product.store) ?? 0) > now()) return unknown();
    if (pending.size >= 64) return unknown();
    const previous = queues.get(product.store) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      if (signal?.aborted || (cooldowns.get(product.store) ?? 0) > now()) return unknown();
      try {
        const origin = origins[product.store];
        let get = clients.get(product.store);
        if (!get) {
          get = await retailerClient(origin, { fetchImpl, signal, timeout: 8000, attempts: 1, interval });
          clients.set(product.store, get);
        }
        const address = new URL(url); address.host = new URL(origin).host;
        const value = parseStock(product.store, await get(address.href), address.href, new Date(now()).toISOString());
        if (!validStock(value, now())) throw new Error('Invalid stock evidence');
        cache.set(url, value); return value;
      } catch (error) {
        // Fixed categories only: never log product URLs, queries, provider bodies or error messages.
        const reason = failureReason(error);
        reportFailure({ event: 'stock_check_failed', retailer: product.store, reason });
        if (['http_403', 'http_429'].includes(reason)) cooldowns.set(product.store, now() + 60_000);
        else if (['network', 'timeout'].includes(reason) && !signal?.aborted) cooldowns.set(product.store, now() + 30_000);
        const value = unknown(); cache.set(url, value); return value;
      }
    }).finally(() => { pending.delete(url); if (queues.get(product.store) === task) queues.delete(product.store); });
    queues.set(product.store, task); pending.set(url, task);
    if (cache.size > 5000) for (const key of [...cache.keys()].slice(0, 500)) cache.delete(key);
    return task;
  }
  return async function verify(products, { signal = AbortSignal.timeout(32_000) } = {}) {
    // A client shares one robots check and its request pacing within this call only.
    // It must not outlive the call's abort signal.
    const clients = new Map();
    if (products.length > 48) throw new Error('Too many stock checks');
    if (disk) {
      try {
        const saved = JSON.parse(await readFile(new URL('../data/stock.json', import.meta.url), 'utf8'));
        for (const product of products) { const entry = saved.products?.[product.url]; if (validStock(entry, now()) && !validStock(cache.get(product.url), now())) cache.set(product.url, entry); }
      } catch { /* No saved run: verify against retailer pages. */ }
    }
    return Promise.all(products.map(async product => {
      const availability = await check(product, signal, clients);
      return { ...product, price: stockFresh(availability, now()) ? availability.price : product.price, availability };
    }));
  };
}
export const verifyProducts = createStockService();
