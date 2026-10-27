import { normalizeProfile, validateEmail } from './profile.js';

export const TRANSFER_VERSION = 1;
export const TRANSFER_LIFETIME = 180_000;
export const LINDEX_ORIGIN = 'https://www.lindex.com';
export const CART_URL = `${LINDEX_ORIGIN}/se/cart?hl=sv`;
export const ADDRESS_URL = `${LINDEX_ORIGIN}/se/checkout/address?hl=sv`;
export function whoolOrigin(value) { try { return ['http://127.0.0.1:3000', 'http://localhost:3000'].includes(new URL(value).origin); } catch { return false; } }
export function lindexOrigin(value) { try { const url = new URL(value); return url.origin === LINDEX_ORIGIN && /^\/se\//.test(url.pathname); } catch { return false; } }
function keys(value, allowed) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Ogiltig överföring.'); }
export function productIdentity(value) {
  if (typeof value !== 'string' || value.length > 600) throw new Error('Ogiltig produktlänk.');
  const url = new URL(value);
  if (url.origin !== LINDEX_ORIGIN || url.username || url.password || url.port) throw new Error('Ogiltig butiksdomän.');
  const match = url.pathname.match(/^\/se\/p\/(\d+)-(\d+)-[a-z0-9-]+\/?$/);
  if (!match) throw new Error('Ogiltig produktlänk.');
  return `${match[1]}:${match[2]}`;
}
export function normalizedSize(value) { return String(value).replace(/[\s–—-]+/g, '/').replace(/\/+/, '/').trim(); }
export function validateTransfer(input, now = Date.now()) {
  keys(input, ['version', 'id', 'createdAt', 'store', 'items', 'profile', 'email']);
  if (input.version !== TRANSFER_VERSION || input.store !== 'lindex' || typeof input.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.id)) throw new Error('Ogiltig överföring.');
  if (!Number.isFinite(input.createdAt) || now - input.createdAt < -5000 || now - input.createdAt > TRANSFER_LIFETIME) throw new Error('Överföringen har löpt ut. Försök igen.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 5) throw new Error('Välj högst fem olika Lindex-plagg.');
  const seen = new Set();
  const items = input.items.map(item => {
    keys(item, ['id', 'url', 'sku', 'size', 'quantity', 'unitMinor']);
    const identity = productIdentity(item.url);
    if (typeof item.sku !== 'string' || !/^\d{1,20}$/.test(item.sku) || seen.has(item.sku)) throw new Error('Varje vald variant måste vara unik.');
    seen.add(item.sku);
    if (typeof item.id !== 'string' || !/^\d{1,18}$/.test(item.id) || typeof item.size !== 'string' || !item.size.trim() || item.size.length > 30 || /[\u0000-\u001f\u007f]/.test(item.size)) throw new Error('Kontrollera vald storlek.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || !Number.isInteger(item.unitMinor) || item.unitMinor < 0 || item.unitMinor > 10_000_000) throw new Error('Kontrollera antal och pris.');
    const url = new URL(item.url); url.search = ''; url.hash = '';
    return { ...item, url: url.href, identity, size: item.size.trim() };
  });
  if (!validateEmail(input.email)) throw new Error('Kontrollera e-postadressen.');
  return { version: TRANSFER_VERSION, id: input.id, createdAt: input.createdAt, expiresAt: input.createdAt + TRANSFER_LIFETIME, store: 'lindex', items, profile: normalizeProfile(input.profile), email: input.email.trim() };
}
export function productAddress(item) { const url = new URL(item.url); productIdentity(url.href); url.search = new URLSearchParams({ hl: 'sv', sku: item.sku }); return url.href; }
export function addressFields(job) {
  return { email: job.email, firstName: job.profile.firstName, lastName: job.profile.lastName, addressLine1: job.profile.addressLine1, addressLine2: [job.profile.careOf ? `C/O ${job.profile.careOf}` : '', job.profile.addressLine2].filter(Boolean).join(', '), postalCode: job.profile.postalCode, city: job.profile.city, phone: job.profile.phone.replace(/^\+46/, '') };
}
export function reconcileCart(items, rows, before = null) {
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('Varukorgen kunde inte verifieras.');
  const found = new Map();
  for (const row of rows) {
    const item = items.find(candidate => candidate.identity === row.identity && normalizedSize(candidate.size) === normalizedSize(row.size));
    if (!item || found.has(item.sku) || row.unitMinor !== item.unitMinor || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > item.quantity) throw new Error('Lindex-varukorgen innehåller andra varor, annat pris eller annat antal. Granska den i butiksfliken.');
    found.set(item.sku, row.quantity);
  }
  if (before) {
    const observed = found.get(before.sku) ?? 0;
    if (observed !== before.quantity + 1) throw new Error('Tillägget kunde inte bekräftas. Granska varukorgen innan ett nytt försök.');
  } else {
    for (const item of items) if (found.has(item.sku) && found.get(item.sku) !== item.quantity) throw new Error('En befintlig varas antal skiljer sig. Ändra det själv i Lindex-varukorgen.');
  }
  const index = items.findIndex(item => (found.get(item.sku) ?? 0) < item.quantity);
  return index < 0 ? { complete: true } : { complete: false, index, quantity: found.get(items[index].sku) ?? 0 };
}
