import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { packageExtension } from '../scripts/package-extension.js';
import { validateTransfer, addressFields, reconcileCart, productAddress, whoolOrigin, lindexOrigin, CART_URL, ADDRESS_URL, TRANSFER_LIFETIME } from '../public/transfer-contract.js';

const url = 'https://www.lindex.com/se/p/3012408-5127-rosa-stickad-troja';
function payload() { return { version: 1, id: randomUUID(), createdAt: Date.now(), store: 'lindex', items: [{ id: '123', url, sku: '9083175', size: '134/140', quantity: 1, unitMinor: 39900 }], email: 'alex@example.com', profile: { firstName: 'Alex', lastName: 'Exempel', phone: '0700000000', addressLine1: 'Exempelgatan 1', addressLine2: 'Lgh 1201', careOf: 'Test Exempel', postalCode: '123 45', city: 'Exempelstad', countryCode: 'SE' } }; }
const source = { url: 'http://127.0.0.1:3000/', frameId: 0, tab: { id: 10 } };
const store = address => ({ url: address, frameId: 0, tab: { id: 20 } });
const row = { identity: '3012408:5127', size: '134/140', quantity: 1, unitMinor: 39900 };
await packageExtension();
let counter = 0;
async function worker({ failCreate = false } = {}) {
  const data = {}, created = [], updated = [];
  const api = {
    storage: { session: { async get(key) { return structuredClone(key === null ? data : { [key]: data[key] }); }, async set(value) { Object.assign(data, structuredClone(value)); }, async remove(key) { delete data[key]; } } },
    runtime: { onMessage: { addListener(listener) { api.message = listener; } } },
    tabs: { async create(value) { if (failCreate) throw new Error('closed'); created.push(value); return { id: 20 }; }, async update(id, value) { updated.push({ id, ...value }); }, onRemoved: { addListener(listener) { api.removed = listener; } } },
    alarms: { create() {}, onAlarm: { addListener(listener) { api.alarm = listener; } } },
  };
  globalThis.browser = api;
  await import(`../extension/lindex-safari/background.js?test=${++counter}`);
  return { data, created, updated, api, send: (message, sender = source) => api.message(message, sender) };
}
test('transfer contract validates destination, exact variants, bounded quantities, expiry and profile fields', () => {
  const value = validateTransfer(payload());
  assert.equal(value.profile.phone, '+46700000000');
  assert.equal(value.profile.postalCode, '12345');
  assert.equal(addressFields(value).addressLine2, 'C/O Test Exempel, Lgh 1201');
  assert.equal(addressFields(value).phone, '700000000');
  assert.equal(new URL(productAddress(value.items[0])).searchParams.get('sku'), '9083175');
  for (const change of [{ store: 'pop' }, { createdAt: Date.now() - TRANSFER_LIFETIME - 1 }, { createdAt: Date.now() + 60_000 }, { id: '-'.repeat(36) }, { email: '' }, { profile: { ...payload().profile, user_id: 'another-user' } }]) assert.throws(() => validateTransfer({ ...payload(), ...change }));
  for (const change of [{ url: 'https://evil.test/se/p/3012408-5127-item' }, { sku: 'bad' }, { quantity: 0 }, { quantity: 11 }, { unitMinor: 39.9 }]) { const request = payload(); request.items[0] = { ...request.items[0], ...change }; assert.throws(() => validateTransfer(request)); }
  assert.equal(whoolOrigin('http://localhost:3000/'), true);
  assert.equal(whoolOrigin('http://localhost:5000/'), false);
  assert.equal(lindexOrigin('https://www.lindex.com.evil.test/se/checkout'), false);
});
test('cart reconciliation never removes other goods, guesses prices or repeats an uncertain addition', () => {
  const items = validateTransfer(payload()).items;
  assert.deepEqual(reconcileCart(items, []), { complete: false, index: 0, quantity: 0 });
  assert.deepEqual(reconcileCart(items, [row]), { complete: true });
  assert.deepEqual(reconcileCart(items, [row], { sku: '9083175', quantity: 0 }), { complete: true });
  for (const change of [{ identity: 'other' }, { size: '146/152' }, { quantity: 2 }, { unitMinor: 49900 }]) assert.throws(() => reconcileCart(items, [{ ...row, ...change }]));
  assert.throws(() => reconcileCart(items, [], { sku: '9083175', quantity: 0 }));
  assert.throws(() => reconcileCart(items, [row, row]));
});
test('concurrent duplicate starts create exactly one bound merchant tab', async () => {
  const app = await worker(), request = payload();
  const results = await Promise.all([app.send({ kind: 'whool-start', payload: request }), app.send({ kind: 'whool-start', payload: request })]);
  assert.ok(results.every(result => result.ok)); assert.equal(app.created.length, 1); assert.equal(app.created[0].url, CART_URL);
  const other = await app.send({ kind: 'whool-start', payload: request }, { ...source, tab: { id: 11 } });
  assert.equal(other.ok, false); assert.equal(app.created.length, 1);
});
test('worker performs cart → exact SKU → verified quantity → address, then erases contact data', async () => {
  const app = await worker(), request = payload();
  await app.send({ kind: 'whool-start', payload: request });
  await app.send({ kind: 'lindex-cart', id: request.id, rows: [] }, store(CART_URL));
  const productUrl = app.updated.at(-1).url;
  assert.equal(new URL(productUrl).searchParams.get('sku'), '9083175');
  assert.equal((await app.send({ kind: 'lindex-begin-add', id: request.id }, store(productUrl))).permitted, true);
  await app.send({ kind: 'lindex-go-cart', id: request.id }, store(productUrl));
  assert.equal(app.updated.at(-1).url, CART_URL);
  await app.send({ kind: 'lindex-cart', id: request.id, rows: [row] }, store(CART_URL));
  assert.equal(app.updated.at(-1).url, ADDRESS_URL);
  const addressJob = await app.send({ kind: 'lindex-job' }, store(ADDRESS_URL));
  assert.equal(addressJob.job.fields.firstName, 'Alex');
  const ready = await app.send({ kind: 'lindex-filled', id: request.id }, store(ADDRESS_URL));
  assert.equal(ready.phase, 'ready_for_customer');
  const saved = Object.values(app.data)[0]; assert.equal('profile' in saved, false); assert.equal('email' in saved, false);
  assert.equal((await app.send({ kind: 'lindex-job' }, store(ADDRESS_URL))).job, null);
});
test('an already correct cart is reused without adding another item', async () => {
  const app = await worker(), request = payload(); await app.send({ kind: 'whool-start', payload: request });
  await app.send({ kind: 'lindex-cart', id: request.id, rows: [row] }, store(CART_URL));
  assert.equal(app.updated.length, 1); assert.equal(app.updated[0].url, ADDRESS_URL);
});
test('cross-origin pages, frames and other tabs cannot obtain the transfer profile', async () => {
  const app = await worker(), request = payload();
  assert.equal((await app.send({ kind: 'whool-start', payload: request }, { ...source, url: 'https://evil.test/' })).ok, false);
  assert.equal((await app.send({ kind: 'whool-start', payload: request }, { ...source, frameId: 1 })).ok, false);
  assert.equal(app.created.length, 0);
  await app.send({ kind: 'whool-start', payload: request });
  assert.equal((await app.send({ kind: 'lindex-job' }, { ...store(ADDRESS_URL), tab: { id: 99 } })).job, null);
  assert.equal((await app.send({ kind: 'whool-status', payload: { id: request.id } }, { ...source, tab: { id: 99 } })).ok, false);
});
test('unexpected cart contents and unconfirmed additions stop and erase the profile', async () => {
  for (const rows of [[{ ...row, size: 'wrong' }], [{ ...row, unitMinor: 123 }]]) {
    const app = await worker(), request = payload(); await app.send({ kind: 'whool-start', payload: request });
    assert.equal((await app.send({ kind: 'lindex-cart', id: request.id, rows }, store(CART_URL))).ok, false);
    const saved = Object.values(app.data)[0]; assert.equal(saved.phase, 'needs_user'); assert.equal('profile' in saved, false); assert.equal(app.updated.length, 0);
  }
});
test('cancellation, closed tabs, expiry and creation failure remove profile access', async () => {
  const app = await worker(), request = payload(); await app.send({ kind: 'whool-start', payload: request });
  await app.send({ kind: 'whool-cancel', payload: { id: request.id } });
  assert.equal(Object.values(app.data)[0].phase, 'cancelled'); assert.equal('profile' in Object.values(app.data)[0], false);
  await app.api.removed(20); assert.equal(Object.keys(app.data).length, 0);
  const next = payload(); await app.send({ kind: 'whool-start', payload: next }); Object.values(app.data)[0].expiresAt = Date.now() - 1;
  await app.api.alarm({ name: 'whool-expiry' }); assert.equal(Object.keys(app.data).length, 0);
  const failed = await worker({ failCreate: true }); assert.equal((await failed.send({ kind: 'whool-start', payload: payload() })).ok, false); assert.equal(Object.keys(failed.data).length, 0);
});
test('Safari package requests only the required hosts and transient storage permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/lindex-safari/manifest.json', import.meta.url)));
  assert.deepEqual(manifest.permissions.sort(), ['alarms', 'storage']);
  assert.deepEqual(manifest.host_permissions.sort(), ['http://127.0.0.1/*', 'http://localhost/*', 'https://www.lindex.com/*']);
  assert.equal(manifest.content_scripts.some(script => script.all_frames === true), false);
  assert.equal('externally_connectable' in manifest, false);
  const archive = await readFile(new URL('../public/whool-lindex-safari.zip', import.meta.url)); assert.equal(archive.readUInt32LE(), 0x04034b50);
});
