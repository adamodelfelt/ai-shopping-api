import { validateTransfer, whoolOrigin, lindexOrigin, productAddress, productIdentity, reconcileCart, addressFields, CART_URL, ADDRESS_URL } from './shared/transfer-contract.js';

const api = typeof browser !== 'undefined' ? browser : chrome;
const key = id => `whool-transfer-${id}`;
const terminal = new Set(['ready_for_customer', 'needs_user', 'cancelled']);
async function jobs() { return Object.values(await api.storage.session.get(null)).filter(value => value?.whoolTransfer === true); }
async function save(job) { await api.storage.session.set({ [key(job.id)]: job }); }
async function closeJob(job, phase, message) {
  job.phase = phase; job.message = message; delete job.profile; delete job.email; delete job.before;
  await save(job); return { ok: phase === 'ready_for_customer', phase, message };
}
function receipt(job) { return { ok: true, id: job.id, phase: job.phase, message: job.message ?? '', expiresAt: job.expiresAt }; }
async function ownedJob(id, sender, side) {
  const job = (await api.storage.session.get(key(id)))[key(id)];
  if (!job || sender.frameId !== 0 || sender.tab?.id !== job[side === 'source' ? 'sourceTabId' : 'storeTabId']) throw new Error('Överföringen tillhör en annan flik.');
  if (Date.now() > job.expiresAt) { await api.storage.session.remove(key(id)); throw new Error('Överföringen har löpt ut.'); }
  return job;
}
async function handle(message, sender) {
  if (sender.frameId !== 0 || !sender.tab?.id) throw new Error('Ogiltig avsändare.');
  if (whoolOrigin(sender.url)) {
    if (message.kind === 'whool-capabilities') return { ok: Boolean(api.storage.session), version: 1, stores: ['lindex'], browser: 'Safari' };
    if (message.kind === 'whool-start') {
      const request = validateTransfer(message.payload);
      if (!api.storage.session) throw new Error('Safari saknar stöd för tillfällig sessionslagring.');
      const all = await jobs();
      if (all.some(job => job.id === request.id && job.sourceTabId !== sender.tab.id)) throw new Error('Överföringen tillhör en annan flik.');
      const active = all.filter(job => job.sourceTabId === sender.tab.id && Date.now() < job.expiresAt);
      const existing = active.find(job => job.id === request.id);
      if (existing) return receipt(existing);
      if (active.some(job => !terminal.has(job.phase))) throw new Error('En överföring pågår redan från denna flik.');
      const job = { ...request, whoolTransfer: true, sourceTabId: sender.tab.id, phase: 'inspect_cart', message: 'Kontrollerar Lindex-varukorgen.' };
      await save(job);
      try { const tab = await api.tabs.create({ url: CART_URL, active: true }); job.storeTabId = tab.id; await save(job); }
      catch { await api.storage.session.remove(key(job.id)); throw new Error('Butiksfliken kunde inte öppnas.'); }
      return receipt(job);
    }
    const job = await ownedJob(message.payload?.id, sender, 'source');
    if (message.kind === 'whool-status') return receipt(job);
    if (message.kind === 'whool-cancel') return closeJob(job, 'cancelled', 'Överföringen är avbruten. Inga varor tas bort.');
    throw new Error('Okänd åtgärd.');
  }
  if (!lindexOrigin(sender.url)) throw new Error('Fel butik.');
  if (message.kind === 'lindex-job') {
    const job = (await jobs()).find(job => job.storeTabId === sender.tab.id && Date.now() < job.expiresAt && !terminal.has(job.phase));
    if (!job) return { ok: true, job: null };
    return { ok: true, job: { id: job.id, phase: job.phase, item: job.items[job.index ?? 0], items: ['inspect_cart', 'verify_cart'].includes(job.phase) ? job.items : undefined, fields: job.phase === 'address' ? addressFields(job) : undefined } };
  }
  const job = await ownedJob(message.id, sender, 'store');
  if (terminal.has(job.phase)) return receipt(job);
  if (message.kind === 'lindex-stop') return closeJob(job, 'needs_user', 'Överföringen stoppades. Granska butiksfliken. Ingen beställning har gjorts.');
  if (message.kind === 'lindex-cart' && ['inspect_cart', 'verify_cart'].includes(job.phase) && new URL(sender.url).pathname === '/se/cart') {
    if (!Array.isArray(message.rows)) throw new Error('rows-type');
    if (!Array.isArray(job.items)) throw new Error('items-type');
    let next; try { next = reconcileCart(job.items, message.rows, job.phase === 'verify_cart' ? job.before : null); } catch (error) { throw new Error(error.message === 'Varukorgen kunde inte verifieras.' ? 'rows-limit' : message.rows.length === 0 ? 'empty-items' : 'cart-data');  }
    if (next.complete) { job.phase = 'address'; job.message = 'Fyller leveransuppgifterna.'; await save(job); try { await api.tabs.update(job.storeTabId, { url: ADDRESS_URL }); } catch { throw new Error('navigate-address'); } }
    else { job.index = next.index; job.quantityBefore = next.quantity; job.phase = 'product'; job.message = 'Förbereder vald produktvariant.'; await save(job); let target; try { target = productAddress(job.items[next.index]); } catch { throw new Error('product-url'); } try { await api.tabs.update(job.storeTabId, { url: target }); } catch { throw new Error('navigate-product'); } }
    return receipt(job);
  }
  if (message.kind === 'lindex-begin-add' && job.phase === 'product') {
    const item = job.items[job.index];
    if (productIdentity(sender.url) !== item.identity || new URL(sender.url).searchParams.get('sku') !== item.sku) throw new Error('Fel produktvariant.');
    job.before = { sku: item.sku, quantity: job.quantityBefore }; job.phase = 'verify_cart'; await save(job);
    return { ok: true, permitted: true };
  }
  if (message.kind === 'lindex-go-cart' && job.phase === 'verify_cart') { await api.tabs.update(job.storeTabId, { url: CART_URL }); return { ok: true }; }
  if (message.kind === 'lindex-filled' && job.phase === 'address' && new URL(sender.url).pathname === '/se/checkout/address') return closeJob(job, 'ready_for_customer', 'Lindex-kassan är förberedd. Granska uppgifterna i samma butiksflik. Ingen beställning har gjorts.');
  throw new Error('Oväntat butikssteg.');
}
let queue = Promise.resolve();
const errorCodes = new Map([['rows-type','rows-type'], ['items-type','items-type'], ['rows-limit','rows-limit'], ['empty-items','empty-items'], ['cart-data', 'cart-data'], ['navigate-address', 'navigate-address'], ['navigate-product', 'navigate-product'], ['product-url', 'product-url'], ['Överföringen tillhör en annan flik.', 'tab-owner'], ['Överföringen har löpt ut.', 'expired'], ['Oväntat butikssteg.', 'step'], ['Ogiltig avsändare.', 'sender'], ['Fel butik.', 'origin']]);
api.runtime.onMessage.addListener((message, sender) => {
  queue = queue.catch(() => {}).then(() => handle(message, sender)).catch(async error => {
  if (message?.id && lindexOrigin(sender.url)) { try { await closeJob(await ownedJob(message.id, sender, 'store'), 'needs_user', 'Kontrollen stämde inte. Granska Lindex-fliken innan du fortsätter.'); } catch { /* No data returned for unowned jobs. */ } }
  return { ok: false, code: errorCodes.get(error.message) ?? (error instanceof TypeError ? 'type' : 'check'), message: 'Överföringen kunde inte verifieras. Granska butiksfliken eller starta om från Whool.' };
  });
  return queue;
});
api.tabs.onRemoved.addListener(async tabId => { for (const job of await jobs()) if (job.sourceTabId === tabId || job.storeTabId === tabId) await api.storage.session.remove(key(job.id)); });
api.alarms.onAlarm.addListener(async alarm => { if (alarm.name === 'whool-expiry') for (const job of await jobs()) if (Date.now() > job.expiresAt) await api.storage.session.remove(key(job.id)); });
api.alarms.create('whool-expiry', { periodInMinutes: 1 });
