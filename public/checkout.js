import { getDeliveryProfile, openAccount } from './account.js';
import { groupCart, prepareStore } from './checkout-model.js';
import { availableSizes, stockFresh } from './availability.js';
import { demoRetailerAllowed, DEMO_CHECKOUT_TIMEOUT, storeCheckoutUrl, prototypeRetailers } from './retailers.js';
import { openStoreTransfer, cancelStoreTransfer } from './store-transfer.js';

const $ = selector => document.querySelector(selector);
const money = minor => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(minor / 100);
function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
function button(text, action, className = 'outline') { const item = node('button', className, text); item.type = 'button'; item.addEventListener('click', action); return item; }
export function storeCheckoutAction(store) {
  const url = storeCheckoutUrl(store); if (!url) return null;
  const link = button('Köp hos butik ↗', () => openStoreTransfer({ group: () => groups().find(group => group.store === store), refresh: checkStock }), 'primary store-checkout-link');
  link.setAttribute('aria-label', `Köp hos butik – ${prototypeRetailers[store]}`);
  return link;
}
function storeCheckoutNote(store) { return node('p', 'small muted store-checkout-note', `Överför valda varor och leveransprofil till ${prototypeRetailers[store]} med Safari-kopplingen. Du granskar och betalar hos butiken.`); }
const selections = new Map(), prepared = new Map(), reviewed = new Set();
let products = [], profileKey = '', removeProduct, updateCart, busy = false, handoffStores = [], activeStore = 0;
const demoCompleted = new Set();
function groups() { return groupCart(products, selections); }
export function checkoutGroups(currentProducts = products) { return groupCart(currentProducts, selections); }
function invalidate(store) {
  if (store === 'lindex') cancelStoreTransfer();
  prepared.delete(store); reviewed.delete(store); demoCompleted.delete(store);
  $('#handoff-dialog').close(); $('#handoff-body').replaceChildren();
}
export function selectedVariant(product) { return selections.get(String(product.id))?.variantId ?? ''; }
export function chooseSize(product, variantId) {
  const variant = availableSizes(product).find(size => size.id === variantId);
  if (!variant) return false;
  selections.set(String(product.id), { variantId, quantity: Math.min(selections.get(String(product.id))?.quantity ?? 1, variant.quantity ?? 10) }); invalidate(product.store); return true;
}
function status(text, error = false) { const item = $('#checkout-status'); item.textContent = text; item.className = error ? 'error' : 'notice'; item.hidden = !text; }
function updateSummary() {
  const current = groups(), saved = getDeliveryProfile();
  $('#checkout-total').textContent = money(current.reduce((sum, group) => sum + group.subtotalMinor, 0));
  $('#checkout-count').textContent = `${current.reduce((sum, group) => sum + group.count, 0)} plagg · ${current.length} ${current.length === 1 ? 'butik' : 'butiker'}`;
  $('#checkout-progress').textContent = `${prepared.size} av ${current.length} demokassor ifyllda${reviewed.size ? ` · ${reviewed.size} ${reviewed.size === 1 ? 'granskad' : 'granskade'}` : ''}`;
  $('#checkout-fill-all').disabled = busy || !products.length;
  $('#checkout-fill-all').textContent = busy ? 'Kontrollerar lager…' : 'Till butikskassorna – demo ↗';
  $('#checkout-refresh').disabled = busy || !products.length;
  const profile = $('#checkout-profile'); profile.replaceChildren();
  if (saved) {
    profile.append(node('p', 'checkout-recipient', `${saved.profile.firstName} ${saved.profile.lastName}`), node('p', 'small muted', `${saved.profile.addressLine1}\n${saved.profile.postalCode} ${saved.profile.city}\n${saved.email}\n${saved.profile.phone}`));
    if (saved.demo) profile.append(node('span', 'checkout-badge', 'Fiktiv testprofil'));
  } else profile.append(node('p', 'small muted', 'Lägg till dina kontakt- och leveransuppgifter en gång för alla butiker. Använd fiktiva uppgifter i prototypen.'));
  $('#checkout-edit-profile').textContent = saved ? 'Ändra leveransprofil' : 'Lägg till leveransprofil';
}
function review(group, plan) {
  const details = node('details', 'checkout-review');
  details.append(node('summary', '', 'Granska ifyllda leveransuppgifter'));
  const form = node('div', 'profile-grid');
  const fields = [['firstName', 'Förnamn'], ['lastName', 'Efternamn'], ['email', 'E-postadress'], ['phone', 'Telefonnummer'], ['addressLine1', 'Gatuadress'], ['addressLine2', 'Extra adressrad'], ['careOf', 'C/O'], ['postalCode', 'Postnummer'], ['city', 'Ort'], ['countryCode', 'Land'], ['deliveryPostalCode', 'Leveransväljarens postnummer']];
  for (const [key, label] of fields) {
    if (!plan.delivery[key] && ['addressLine2', 'careOf'].includes(key)) continue;
    const field = node('label', ['email', 'addressLine1', 'addressLine2', 'careOf', 'deliveryPostalCode'].includes(key) ? 'field wide' : 'field', label);
    const input = node('input'); input.value = plan.delivery[key]; input.readOnly = true; input.autocomplete = 'off'; field.append(input); form.append(field);
  }
  details.append(form, node('p', 'small muted', 'Adress och leveransväljare har samma postnummer. Betalning väljs och köpet slutförs senare i respektive butik.'));
  const confirm = button(reviewed.has(group.store) ? '✓ Uppgifterna är granskade' : 'Markera som granskad', () => { reviewed.add(group.store); confirm.textContent = '✓ Uppgifterna är granskade'; confirm.disabled = true; updateSummary(); }, 'outline');
  confirm.disabled = reviewed.has(group.store); details.append(confirm); return details;
}
function storeCard(group) {
  const card = node('section', 'checkout-store'); card.dataset.store = group.store;
  const header = node('div', 'checkout-store-heading'), title = node('div');
  title.append(node('p', 'eyebrow', 'BUTIKSKASSA'), node('h3', '', group.name));
  const badge = node('span', prepared.has(group.store) ? 'checkout-badge ready' : 'checkout-badge', prepared.has(group.store) ? '✓ Demokassa ifylld' : 'Välj storlek & antal'); header.append(title, badge); card.append(header);
  for (const item of group.items) {
    const row = node('div', 'checkout-product');
    if (item.image) { try { const url = new URL(item.image); if (url.protocol === 'https:' && !url.username && !url.password) { const image = node('img'); image.src = url.href; image.alt = ''; image.referrerPolicy = 'no-referrer'; image.loading = 'lazy'; row.append(image); } } catch { /* An image is optional. */ } }
    const info = node('div', 'checkout-product-info'); info.append(node('p', 'brand', item.brand || group.name), node('h4', '', item.name), node('p', 'small', `${money(item.unitMinor)} / st`));
    const controls = node('div', 'checkout-product-controls');
    const sizeLabel = node('label', 'field', 'Storlek'), size = node('select'); size.setAttribute('aria-label', `Storlek för ${item.name}`);
    const placeholder = node('option', '', 'Välj storlek'); placeholder.value = ''; size.append(placeholder);
    const fresh = stockFresh(item.availability);
    for (const variant of item.availability?.sizes ?? []) {
      const option = node('option', '', `${variant.label}${variant.available ? '' : ' · Slut i lager'}`); option.value = variant.id; option.disabled = !fresh || !variant.available; option.selected = variant.id === item.variantId; size.append(option);
    }
    size.addEventListener('change', () => { if (!size.value) { selections.delete(item.id); invalidate(group.store); } else chooseSize(item, size.value); render(); status(''); });
    sizeLabel.append(size);
    const qtyLabel = node('label', 'field', 'Antal'), qty = node('select'); qty.setAttribute('aria-label', `Antal för ${item.name}`);
    const variant = availableSizes(item).find(value => value.id === item.variantId);
    for (let count = 1; count <= Math.min(10, variant?.quantity ?? 10); count++) { const option = node('option', '', String(count)); option.value = String(count); option.selected = count === item.quantity; qty.append(option); }
    qty.addEventListener('change', () => { selections.set(item.id, { variantId: selections.get(item.id)?.variantId ?? '', quantity: Number(qty.value) }); invalidate(group.store); render(); status(''); });
    qtyLabel.append(qty); controls.append(sizeLabel, qtyLabel); info.append(controls);
    const actions = node('div', 'checkout-product-end'), remove = button('Ta bort', () => removeProduct(item), 'text-button'); remove.setAttribute('aria-label', `Ta bort ${item.name}`);
    actions.append(node('p', 'price', money(item.totalMinor)), remove); row.append(info, actions); card.append(row);
  }
  const footer = node('div', 'checkout-store-footer'), go = button('Till demokassan ↗', () => fill([group.store]), 'outline'); go.disabled = busy;
  footer.append(node('p', '', `Varusumma ${money(group.subtotalMinor)}`));
  const checkoutLink = storeCheckoutAction(group.store);
  if (checkoutLink) footer.append(checkoutLink);
  footer.append(go); card.append(footer);
  if (checkoutLink) card.append(storeCheckoutNote(group.store));
  if (prepared.has(group.store)) card.append(review(group, prepared.get(group.store)));
  return card;
}
function render() {
  const container = $('#checkout-stores'); container.replaceChildren();
  const current = groups();
  if (!current.length) container.append(node('p', 'empty-cart', 'Inga plagg valda. Stäng kassan och välj plagg för att fortsätta.'));
  for (const group of current) container.append(storeCard(group));
  updateSummary();
}
async function checkStock() {
  const response = await fetch('/api/stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ productIds: products.map(product => product.id) }), signal: AbortSignal.timeout(DEMO_CHECKOUT_TIMEOUT + 2000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Lagerkontrollen kunde inte slutföras.');
  const fresh = new Map(data.products.map(product => [product.id, product]));
  products = products.map(product => {
    const updated = fresh.get(product.id) ?? { ...product, availability: { status: 'unknown', sizes: [] } };
    const inventory = item => JSON.stringify({ price: item.price, status: item.availability?.status, sizes: item.availability?.sizes });
    if (inventory(product) !== inventory(updated)) invalidate(product.store);
    return updated;
  });
  updateCart?.(products);
}
export async function refreshCheckoutStock() {
  if (busy || !products.length) return;
  busy = true; render(); status('Kontrollerar storlekar och lager hos butikerna…');
  try { await checkStock(); status('Lagerkontrollen är klar. Grå storlekar går inte att välja.'); }
  catch (error) { status(error.message, true); }
  finally { busy = false; render(); }
}
async function fill(stores) {
  if (busy) return;
  const saved = getDeliveryProfile();
  if (!saved) { status('Lägg till en leveransprofil för att fylla i demokassorna.', true); openAccount(); return; }
  busy = true; render(); status('Kontrollerar lager innan du går vidare…');
  try {
    await checkStock();
    const current = groups().filter(group => stores.includes(group.store));
    if (!current.length) throw new Error('Varukorgen är tom.');
    // Validate every selected store before changing any prepared state.
    const plans = current.map(group => prepareStore(group, getDeliveryProfile()));
    for (const plan of plans) { prepared.set(plan.store, plan); reviewed.delete(plan.store); }
    render(); status('Dina demokassor är förberedda.');
    handoffStores = plans.map(plan => plan.store); activeStore = 0; renderHandoff(); $('#handoff-dialog').showModal();
  } catch (error) {
    status(error.message, true);
    const missing = $('#checkout-stores').querySelectorAll('.checkout-product-controls select');
    [...missing].find(input => !input.value.trim())?.focus();
  } finally { busy = false; render(); }
}
export function syncCheckout(nextProducts, remove, updated) {
  const previous = new Map(products.map(product => [String(product.id), product]));
  products = [...nextProducts].filter(product => demoRetailerAllowed(product.store)); removeProduct = remove; updateCart = updated;
  const ids = new Set(products.map(product => String(product.id)));
  for (const product of products) if (JSON.stringify(previous.get(String(product.id))) !== JSON.stringify(product)) invalidate(product.store);
  for (const [id, product] of previous) if (!ids.has(id)) { selections.delete(id); invalidate(product.store); }
  if ($('#checkout-dialog').open) { render(); status(''); }
}
export function openCheckout() {
  $('#cart-dialog').close(); status(''); render(); $('#checkout-dialog').showModal();
}
$('#checkout-fill-all').addEventListener('click', () => fill(groups().map(group => group.store)));
$('#checkout-refresh').addEventListener('click', refreshCheckoutStock);
$('#checkout-edit-profile').addEventListener('click', openAccount);
document.addEventListener('whool-account-changed', () => {
  const key = JSON.stringify(getDeliveryProfile());
  if (key === profileKey) return;
  profileKey = key; prepared.clear(); reviewed.clear();
  cancelStoreTransfer();
  demoCompleted.clear(); $('#handoff-dialog').close(); $('#handoff-body').replaceChildren();
  // Remove old contact details even when the checkout is closed.
  render(); status('');
});

function renderHandoff() {
  const body = $('#handoff-body'); body.replaceChildren();
  const store = handoffStores[activeStore], plan = prepared.get(store);
  if (!plan) { $('#handoff-dialog').close(); return; }
  $('#handoff-title').textContent = `Din demokassa hos ${plan.name}`;
  const completedCount = handoffStores.filter(key => demoCompleted.has(key)).length;
  $('#handoff-progress').textContent = `Butik ${activeStore + 1} av ${handoffStores.length} · ${completedCount} demoköp ${completedCount === 1 ? 'klart' : 'klara'}`;
  const steps = node('nav', 'handoff-steps'); steps.setAttribute('aria-label', 'Dina demokassor');
  handoffStores.forEach((key, index) => { const tab = button(`${demoCompleted.has(key) ? '✓ ' : ''}${prepared.get(key).name}`, () => { activeStore = index; renderHandoff(); }, index === activeStore ? 'outline active' : 'outline'); tab.setAttribute('aria-current', index === activeStore ? 'step' : 'false'); steps.append(tab); }); body.append(steps);
  const checkoutLink = storeCheckoutAction(store);
  if (checkoutLink) body.append(checkoutLink, storeCheckoutNote(store));
  if (demoCompleted.has(store)) {
    body.append(node('div', 'handoff-success', '✓ Demoköpet är klart'), node('p', 'muted small', `Flödet hos ${plan.name} är färdigt i prototypen. Ingen riktig order har skapats och inga pengar har dragits.`));
    const next = handoffStores.findIndex(key => !demoCompleted.has(key));
    if (next >= 0) body.append(button(`Nästa demokassa: ${prepared.get(handoffStores[next]).name} ↗`, () => { activeStore = next; renderHandoff(); }, 'primary'));
    else body.append(node('p', 'notice', 'Alla dina demoköp är klara.'), button('Tillbaka till Whool', () => { $('#handoff-dialog').close(); $('#checkout-dialog').close(); }, 'primary'));
    return;
  }
  const layout = node('div', 'handoff-layout'), order = node('section'), delivery = node('section', 'handoff-delivery');
  order.append(node('p', 'eyebrow', 'DINA PLAGG'));
  for (const item of plan.items) {
    const row = node('div', 'handoff-item'); row.append(node('h3', '', item.name), node('p', 'small muted', `Storlek ${item.size} · ${item.quantity} st`), node('strong', 'small', money(item.totalMinor))); order.append(row);
  }
  order.append(node('p', 'checkout-total-row', `Varusumma: ${money(plan.subtotalMinor)}`), node('p', 'small muted', 'Frakt och slutpris bekräftas i den riktiga butikskassan.'));
  const contact = plan.delivery;
  delivery.append(node('p', 'eyebrow', 'LEVERANSUPPGIFTER · AUTOMATISKT IFYLLDA'), node('h3', '', contact.fullName), node('p', 'handoff-address small', [contact.careOf ? `C/O ${contact.careOf}` : '', contact.addressLine1, contact.addressLine2, `${contact.postalCode} ${contact.city}`, 'Sverige', contact.email, contact.phone].filter(Boolean).join('\n')), node('p', 'small muted', `Leveransväljarens postnummer: ${contact.deliveryPostalCode}`));
  layout.append(order, delivery); body.append(layout);
  const form = node('form', 'handoff-payment'), fieldset = node('fieldset'); fieldset.append(node('legend', '', 'Välj betalning i demon'));
  for (const method of ['Swish', 'Kort', 'Faktura']) {
    const label = node('label', 'demo-payment-choice'), radio = node('input'); radio.type = 'radio'; radio.name = 'demoPayment'; radio.value = method; radio.required = true; label.append(radio, node('span', '', method)); fieldset.append(label);
  }
  const complete = node('button', 'primary', 'Slutför demoköp'); complete.type = 'submit';
  form.append(fieldset, node('p', 'small muted', 'Endast en simulering. Inga betaluppgifter behövs och ingen beställning skickas.'), complete);
  form.addEventListener('submit', event => { event.preventDefault(); demoCompleted.add(store); reviewed.add(store); renderHandoff(); updateSummary(); }); body.append(form);
}
