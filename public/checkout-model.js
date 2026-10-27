import { autofillValues } from './profile.js';
import { availableSizes } from './availability.js';
import { prototypeRetailers } from './retailers.js';

export const retailers = prototypeRetailers;
export function minorUnits(price) {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1_000_000) throw new Error('Priset behöver kontrolleras i butiken.');
  return Math.round((price + Number.EPSILON) * 100);
}
export function groupCart(products, selections = new Map()) {
  const groups = new Map(), seen = new Set();
  for (const product of products) {
    const id = String(product.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const store = product.store;
    if (!groups.has(store)) groups.set(store, { store, name: Object.hasOwn(retailers, store) ? retailers[store] : 'Okänd återförsäljare', supported: Object.hasOwn(retailers, store), items: [], subtotalMinor: 0, count: 0 });
    const choice = selections.get(id) ?? { size: '', quantity: 1 };
    const quantity = choice.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Välj mellan 1 och 10 exemplar.');
    const variant = product.availability?.sizes?.find(size => size.id === choice.variantId);
    const unitMinor = minorUnits(variant?.price ?? product.price), group = groups.get(store);
    group.items.push({ ...product, id, variantId: choice.variantId ?? '', size: variant?.label ?? '', quantity, unitMinor, totalMinor: unitMinor * quantity });
    group.subtotalMinor += unitMinor * quantity;
    group.count += quantity;
  }
  return [...groups.values()];
}
export function prepareStore(group, saved) {
  if (!group.supported || !group.items.length) throw new Error('Butiken kan inte förhandsvisas.');
  if (!saved) throw new Error('Lägg till en leveransprofil först.');
  for (const item of group.items) {
    const variant = availableSizes(item).find(size => size.id === item.variantId);
    if (!variant) throw new Error('Välj en tillgänglig storlek för varje plagg.');
    if (variant.quantity !== undefined && item.quantity > variant.quantity) throw new Error('Det valda antalet finns inte i lager. Välj ett lägre antal.');
  }
  return { store: group.store, name: group.name, items: group.items.map(item => ({ ...item })), subtotalMinor: group.subtotalMinor, delivery: autofillValues(saved.profile, saved.email) };
}
