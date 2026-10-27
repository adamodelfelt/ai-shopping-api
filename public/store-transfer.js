import { getDeliveryProfile, openAccount } from './account.js';
import { prepareStore } from './checkout-model.js';
import { validateTransfer, TRANSFER_VERSION, TRANSFER_LIFETIME } from './transfer-contract.js';

const $ = selector => document.querySelector(selector);
const requests = new Map();
let pendingPayload = null, activeJob = null, pollTimer = null, generation = 0;
function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function message(text, error = false) { const target = $('#transfer-message'); target.textContent = text; target.className = error ? 'error' : 'notice'; }
function bridge(action, payload, timeout = 3000) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(requestId); reject(new Error('Safari-kopplingen svarar inte. Kontrollera tillägget och dess webbplatsbehörigheter.')); }, timeout);
    requests.set(requestId, { resolve, timer });
    window.postMessage({ channel: 'whool-lindex-v1', direction: 'request', requestId, action, payload }, location.origin);
  });
}
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'whool-lindex-v1' || event.data.direction !== 'reply') return;
  const pending = requests.get(event.data.requestId); if (!pending) return;
  clearTimeout(pending.timer); requests.delete(event.data.requestId); pending.resolve(event.data.result);
});
function clearPreview() { pendingPayload = null; $('#transfer-review').replaceChildren(); $('#transfer-accept').hidden = true; }
function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }
export async function cancelStoreTransfer() {
  if (!pendingPayload && !activeJob) return;
  generation++; clearPreview(); stopPolling();
  const previous = activeJob; activeJob = null; $('#transfer-cancel').hidden = true;
  if (previous && !['ready_for_customer', 'needs_user', 'cancelled'].includes(previous.phase)) {
    try { await bridge('cancel', { id: previous.id }); } catch { /* Browser expiry still bounds the job. */ }
  }
  message('Valen eller profilen ändrades. Starta en ny överföring när uppgifterna är klara.');
}
async function poll() {
  if (!activeJob) return;
  if (Date.now() > activeJob.expiresAt) { activeJob = null; message('Överföringen har löpt ut. Granska butiksfliken innan du försöker igen.', true); $('#transfer-cancel').hidden = true; return; }
  try {
    const result = await bridge('status', { id: activeJob.id });
    if (!activeJob) return;
    if (!result?.ok) throw new Error(result?.message || 'Överföringen kunde inte följas.');
    activeJob.phase = result.phase; message(result.message || 'Förbereder Lindex i butiksfliken.', result.phase === 'needs_user');
    if (['ready_for_customer', 'needs_user', 'cancelled'].includes(result.phase)) { activeJob = null; $('#transfer-cancel').hidden = true; return; }
  } catch (error) { message(error.message, true); }
  if (activeJob) pollTimer = setTimeout(poll, 1000);
}
export async function openStoreTransfer({ group, refresh }) {
  const dialog = $('#store-transfer-dialog'); if (!dialog.open) dialog.showModal();
  if (activeJob) { message('En överföring pågår redan. Fortsätt i den öppnade Lindex-fliken.'); return; }
  clearPreview(); $('#transfer-setup').hidden = true; $('#transfer-cancel').hidden = true;
  const current = ++generation; message('Kontrollerar Safari-kopplingen…');
  try {
    let capability; try { capability = await bridge('capabilities', null, 1000); } catch { capability = null; }
    if (current !== generation || !dialog.open) return;
    if (!capability?.ok || capability.version !== 1 || !capability.stores?.includes('lindex')) {
      $('#transfer-setup').hidden = false; message('Aktivera Whools Safari-koppling för att föra över varor och uppgifter. Inget har skickats till Lindex.'); return;
    }
    const saved = getDeliveryProfile();
    if (!saved) { dialog.close(); await openAccount(); return; }
    message('Kontrollerar valda varor och lager…'); await refresh();
    if (current !== generation || !dialog.open) return;
    const selection = group(); if (!selection) throw new Error('Lägg först till ett Lindex-plagg i varukorgen.');
    const plan = prepareStore(selection, getDeliveryProfile());
    const profile = getDeliveryProfile();
    const payload = { version: TRANSFER_VERSION, id: crypto.randomUUID(), createdAt: Date.now(), store: 'lindex', items: plan.items.map(item => ({ id: item.id, url: item.url, sku: item.variantId, size: item.size, quantity: item.quantity, unitMinor: item.unitMinor })), profile: profile.profile, email: profile.email };
    validateTransfer(payload); pendingPayload = payload;
    const review = $('#transfer-review');
    for (const item of plan.items) review.append(node('p', 'small', `${item.name} · ${item.size} · ${item.quantity} st`));
    review.append(node('p', 'transfer-address small', [plan.delivery.fullName, plan.delivery.email, plan.delivery.phone, plan.delivery.careOf ? `C/O ${plan.delivery.careOf}` : '', plan.delivery.addressLine1, plan.delivery.addressLine2, `${plan.delivery.postalCode} ${plan.delivery.city}`].filter(Boolean).join('\n')));
    message('Granska uppgifterna. När du fortsätter får Lindex dessa varor och kontakt-/leveransuppgifter. Du väljer själv leverans och betalning i butikens kassa.');
    $('#transfer-accept').hidden = false; $('#transfer-accept').disabled = false;
  } catch (error) { clearPreview(); message(error.message, true); }
}
$('#transfer-accept').addEventListener('click', async () => {
  if (!pendingPayload || activeJob) return;
  const payload = pendingPayload;
  try {
    validateTransfer(payload);
    const saved = getDeliveryProfile();
    if (!saved || JSON.stringify(saved.profile) !== JSON.stringify(payload.profile) || saved.email !== payload.email) throw new Error('Leveransprofilen ändrades. Starta överföringen igen.');
    $('#transfer-accept').disabled = true; message('Öppnar Lindex och förbereder varukorgen…');
    activeJob = { id: payload.id, phase: 'preparing', expiresAt: payload.createdAt + TRANSFER_LIFETIME };
    const response = await bridge('start', payload, 15_000);
    if (!response?.ok) { activeJob = null; throw new Error(response?.message || 'Lindex kunde inte förberedas.'); }
    clearPreview(); $('#transfer-cancel').hidden = false; await poll();
  } catch (error) { message(error.message, true); $('#transfer-accept').disabled = false; if (activeJob) { $('#transfer-cancel').hidden = false; poll(); } }
});
$('#transfer-cancel').addEventListener('click', () => cancelStoreTransfer());
$('#store-transfer-dialog').addEventListener('close', () => { if (!activeJob) { generation++; clearPreview(); } });
