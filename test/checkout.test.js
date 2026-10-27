import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCart, minorUnits, prepareStore } from '../public/checkout-model.js';

const product = (id, store, price) => ({ id, store, price, name: `Plagg ${id}`, availability: { status: 'verified', checkedAt: new Date().toISOString(), sizes: [{id:'available', label:'110/116', available:true,quantity:10}, {id:'soldout',label:'98',available:false,quantity:0}] } });
const saved = { demo: true, email: 'alex@example.com', profile: { firstName: 'Alex', lastName: 'Exempel', phone: '0700000000', addressLine1: 'Exempelgatan 1', addressLine2: 'Lgh 1201', careOf: 'Test Exempel', postalCode: '123 45', city: 'Exempelstad', countryCode: 'SE' } };

test('checkout groups unique products per retailer and adds exact öre for quantities', () => {
  const products = [product('1', 'lindex', 39.5), product('2', 'pop', 199), product('3', 'lindex', 0.1)];
  const choices = new Map([['1', { quantity: 3, variantId: 'available' }], ['3', { quantity: 3, variantId: 'available' }]]);
  const groups = groupCart([...products, products[0]], choices);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'Lindex');
  assert.equal(groups[0].count, 6);
  assert.equal(groups[0].subtotalMinor, 11880);
  assert.equal(groups[1].name, 'Polarn O. Pyret');
  assert.equal(groups[1].subtotalMinor, 19900);
  assert.equal(groups[1].items[0].size, '');
});
test('checkout refuses invalid prices and quantities rather than creating false totals', () => {
  for (const price of [-1, NaN, Infinity, '199', 1_000_001]) assert.throws(() => minorUnits(price));
  for (const quantity of [0, 11, 1.5, NaN, '2']) assert.throws(() => groupCart([product('1', 'lindex', 199)], new Map([['1', { quantity, variantId: 'available' }]])));
});
test('each checkout requires an explicit size and valid delivery profile', () => {
  const products = [product('1', 'lindex', 199)];
  assert.throws(() => prepareStore(groupCart(products)[0], saved), /storlek/);
  const group = groupCart(products, new Map([['1', { quantity: 1, variantId: 'available' }]]))[0];
  assert.throws(() => prepareStore(group, null), /leveransprofil/);
  assert.throws(() => prepareStore(group, { ...saved, email: '' }), /e-post/);
  const prepared = prepareStore(group, saved);
  assert.equal(prepared.delivery.phone, '+46700000000');
  assert.equal(prepared.delivery.deliveryPostalCode, '12345');
  assert.equal(prepared.delivery.addressLine2, 'Lgh 1201');
  assert.equal(prepared.delivery.careOf, 'Test Exempel');
  assert.equal(prepared.items[0].size, '110/116');
  assert.equal(prepared.subtotalMinor, 19900);
  assert.equal('payment' in prepared, false);
  assert.equal('shippingMinor' in prepared, false);
});
test('repeated preparation is stable and isolated from later product edits', () => {
  const group = groupCart([product('1', 'newbie', 99.9)], new Map([['1', { variantId: 'available', quantity: 2 }]]))[0];
  const first = prepareStore(group, saved), second = prepareStore(group, saved);
  assert.deepEqual(first, second);
  group.items[0].size = '104';
  assert.equal(first.items[0].size, '110/116');
  assert.equal(first.delivery.city, 'Exempelstad');
});
test('an unknown retailer cannot be prepared as if it has an integration', () => {
  for (const store of ['unknown', '__proto__', 'constructor']) {
    const group = groupCart([product('1', store, 199)])[0];
    assert.equal(group.supported, false);
    assert.throws(() => prepareStore(group, saved), /Butiken/);
  }
});
