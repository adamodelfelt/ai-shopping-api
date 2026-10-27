import { makeGroup, visible, mergeRefresh } from './state.js';
import { openAccount, getDeliveryProfile, getAccountState, saveAccountFavorites } from './account.js';
import { createFavoriteStore, favoriteIds } from './favorites-model.js';
import { browserFavoriteStorage } from './favorites-storage.js';
import { openCheckout, syncCheckout, checkoutGroups, selectedVariant, chooseSize, refreshCheckoutStock, storeCheckoutAction } from './checkout.js';
import { availableSizes, stockFresh } from './availability.js';
import { demoRetailerAllowed } from './retailers.js';

const $ = selector => document.querySelector(selector);
const state = { groups: [], cart: new Map(), searchId: 0, similarId: 0, controller: null };
const favorites = createFavoriteStore(browserFavoriteStorage()), favoriteProducts = new Map();
let favoriteNudgeShown = false, favoritesGeneration = 0, favoriteSaving = false;
const money = value => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 }).format(value);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, action, className = '') {
  const node = element('button', className, text);
  node.type = 'button'; node.addEventListener('click', action); return node;
}
function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function externalLink(url, text, className = '') {
  const href = safeLink(url);
  if (!href) return element('span', 'muted small', 'Butikslänk saknas');
  const link = element('a', className, text); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function announce(text) { $('#status').textContent = text; }
function errorMessage(text = '') { $('#error').hidden = !text; $('#error').textContent = text; }
function heartIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('heart-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20.5 4.8a5.3 5.3 0 0 0-7.5 0L12 5.9l-1.1-1.1a5.3 5.3 0 0 0-7.5 7.5L12 21l8.6-8.7a5.3 5.3 0 0 0-.1-7.5Z');
  svg.append(path); return svg;
}
function updateFavoriteState() {
  for (const group of state.groups) group.pinned = new Set(group.pool.filter(product => favorites.has(product.id)).map(product => product.id));
  $('#favorites-count').textContent = String(favorites.ids().length);
  $('#favorites-open').setAttribute('aria-label', `Favoriter, ${favorites.ids().length} sparade produkter`);
  $('#favorites-save-account').hidden = !getAccountState().authenticated || !favorites.localIds().length;
  $('#favorites-login').hidden = getAccountState().authenticated;
  $('#favorites-account-note').textContent = getAccountState().authenticated ? `${favorites.localIds().length} på den här enheten · ${favorites.accountIds().length} sparade på kontot` : 'Sparade på den här enheten. Skapa konto eller logga in för att samla favoriter på flera enheter.';
}
function cardPositions() {
  return new Map([...$('#results').querySelectorAll('[data-card-key]')].map(card => [card.dataset.cardKey, card.getBoundingClientRect()]));
}
async function toggleFavorite(product) {
  if (favoriteSaving) return;
  const before = cardPositions(), wasSaved = favorites.has(product.id);
  const focusKey = document.activeElement?.closest('[data-card-key]')?.dataset.cardKey;
  if (product.name) favoriteProducts.set(product.id, product);
  try {
    if (getAccountState().authenticated) {
      favoriteSaving = true;
      const next = wasSaved ? favorites.accountIds().filter(id => id !== product.id) : favoriteIds([...favorites.accountIds(), product.id]);
      if (!wasSaved && favorites.ids().length >= 100) throw new Error('Du kan spara högst 100 favoriter.');
      await saveAccountFavorites(next);
      if (wasSaved) favorites.removeLocal(product.id);
    } else favorites.toggleLocal(product.id);
    updateFavoriteState(); if (state.groups.length) renderGroups(before); renderFavorites();
    if (focusKey) [...$('#results').querySelectorAll('[data-card-key]')].find(card => card.dataset.cardKey === focusKey)?.querySelector('.favorite-toggle')?.focus({ preventScroll: true });
    announce(wasSaved ? 'Produkten är borttagen från dina favoriter.' : 'Produkten är sparad som favorit.');
    if (!wasSaved && !getAccountState().authenticated && !favoriteNudgeShown) { $('#favorite-nudge').hidden = false; favoriteNudgeShown = true; }
    if (!favorites.persistent()) $('#favorites-feedback').textContent = 'Webbläsaren tillåter inte lagring. Favoriterna finns bara kvar i denna flik.';
  } catch (error) { errorMessage(error.message); }
  finally { favoriteSaving = false; }
}
function renderFavorites() {
  if (!$('#favorites-dialog').open) return;
  const container = $('#favorite-items'); container.replaceChildren();
  for (const id of favorites.ids().reverse()) {
    const product = favoriteProducts.get(id);
    if (product) container.append(productCard(product));
    else { const item = element('div', 'missing-favorite'); item.append(element('p', '', 'Den sparade produkten kunde inte hämtas.'), button('Ta bort favorit', () => toggleFavorite({ id }), 'text-button')); container.append(item); }
  }
  if (!favorites.ids().length) container.append(element('p', 'empty-results', 'Hjärta ett plagg så samlas det här.'));
}
async function openFavorites() {
  updateFavoriteState(); const dialog = $('#favorites-dialog'); if (!dialog.open) dialog.showModal();
  const generation = ++favoritesGeneration; renderFavorites();
  if (!favorites.ids().length) return;
  $('#favorites-feedback').textContent = 'Kontrollerar dina favoriters storlekar och lager…';
  try {
    const ids = favorites.ids();
    for (let offset = 0; offset < ids.length; offset += 20) {
      const data = await request('stock', { productIds: ids.slice(offset, offset + 20) });
      if (generation !== favoritesGeneration || !dialog.open) return;
      for (const product of data.products) favoriteProducts.set(product.id, product);
      renderFavorites();
    }
    $('#favorites-feedback').textContent = 'Storlekar och pris är kontrollerade där butiken kunde nås. Endast aktuellt lager går att lägga i varukorgen.';
  } catch { if (generation === favoritesGeneration) $('#favorites-feedback').textContent = 'Alla favoriter kunde inte lagerkontrolleras. Försök igen innan du handlar.'; }
}
function catalogueNote(catalogue) {
  if (!catalogue) return;
  const note = $('#catalogue-note'); note.hidden = catalogue.source !== 'snapshot';
  note.textContent = catalogue.source === 'snapshot' ? `Förhandsvisning · katalog från ${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeZone: 'Europe/Stockholm' }).format(new Date(catalogue.updatedAt))}. Storlekar och pris kontrolleras separat hos butikerna.` : '';
}
async function request(route, body, signal) {
  const response = await fetch(`/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(40_000), credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sökningen kunde inte slutföras.');
  return data;
}
function toggleCart(product) {
  if (state.cart.has(product.id)) state.cart.delete(product.id);
  else {
    if (!demoRetailerAllowed(product.store)) return;
    if (!availableSizes(product).length) { errorMessage('Lagerkontrollen behöver uppdateras. Sök igen för att kontrollera tillgängligheten.'); return; }
    if (state.cart.size >= 20) { errorMessage('Varukorgen rymmer högst 20 olika plagg i prototypen.'); return; }
    state.cart.set(product.id, product);
  }
  renderCart(); renderGroups();
  // Update cards inside the independent similarity dialog too.
  document.querySelectorAll('[data-cart-id]').forEach(node => {
    const selected = state.cart.has(node.dataset.cartId);
    node.textContent = selected ? '✓ Tillagd' : '+ Varukorg'; node.setAttribute('aria-pressed', String(selected));
  });
}
function sizePills(product) {
  const container = element('div', 'product-sizes');
  container.append(element('p', 'size-label', stockFresh(product.availability) ? 'Storlekar · lagerkontrollerade' : 'Lagerkontroll behövs'));
  const choices = element('div', 'size-pills');
  for (const variant of product.availability?.sizes ?? []) {
    const pill = button(variant.label, () => {
      if (!chooseSize(product, variant.id)) return;
      if (!state.cart.has(product.id)) toggleCart(product);
      else { renderCart(); renderGroups(); }
    }, 'size-pill');
    pill.disabled = !stockFresh(product.availability) || !variant.available;
    pill.title = `${variant.label}${variant.available ? ' · I lager vid kontrollen' : ' · Slut i lager'}`;
    pill.setAttribute('aria-label', `${variant.label} för ${product.name}${variant.available ? '' : ', slut i lager'}`);
    pill.setAttribute('aria-pressed', String(selectedVariant(product) === variant.id)); choices.append(pill);
  }
  container.append(choices); return container;
}
function productCard(product, group) {
  favoriteProducts.set(product.id, product);
  const saved = favorites.has(product.id);
  const card = element('article', `product-card${saved ? ' is-favorite' : ''}`);
  if (group) card.dataset.cardKey = `${state.groups.indexOf(group)}:${product.id}`;
  const media = element('div', 'product-media');
  const imageUrl = safeLink(product.image);
  if (imageUrl) {
    const img = element('img'); img.src = imageUrl; img.alt = product.name; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.remove(); media.append(element('span', 'image-missing', 'Bild saknas')); }, { once: true });
    media.append(img);
  } else media.append(element('span', 'image-missing', 'Bild saknas'));
  const heart = button('', () => toggleFavorite(product), `favorite-toggle${saved ? ' active' : ''}`);
  heart.append(heartIcon()); heart.setAttribute('aria-label', `${saved ? 'Ta bort favorit' : 'Spara favorit'}: ${product.name}`); heart.setAttribute('aria-pressed', String(saved)); media.append(heart);
  const details = element('div', 'product-details');
  const priceVaries = product.availability?.sizes?.some(size => size.available && size.price !== product.price);
  details.append(element('p', 'brand', product.brand || product.store), element('h3', '', product.name), element('p', 'price', `${priceVaries ? 'Från ' : ''}${money(product.price)}`));
  if (product.store === 'newbie') details.append(element('p', 'small muted retailer-name', 'Säljs hos Kappahl'));
  if (product.playfulReason) details.append(element('p', 'small muted playful-reason', product.playfulReason));
  if (product.similarity?.reasons?.length) details.append(element('p', 'small muted', product.similarity.reasons.join(' · ')));
  const actions = element('div', 'product-actions');
  const cart = button(state.cart.has(product.id) ? '✓ Tillagd' : '+ Varukorg', () => toggleCart(product), 'save-button');
  cart.disabled = !state.cart.has(product.id) && !availableSizes(product).length;
  cart.dataset.cartId = product.id; cart.setAttribute('aria-pressed', String(state.cart.has(product.id)));
  actions.append(cart, externalLink(product.url, product.store === 'newbie' ? 'Till Kappahl ↗' : 'Till butik ↗', 'store-link'));
  details.append(actions);
  details.append(sizePills(product));
  if (group) details.append(button('Hitta liknande', () => findSimilar(product), 'similar-button'));
  card.append(media, details); return card;
}
function renderCart() {
  $('#cart-count').textContent = String(state.cart.size);
  const container = $('#cart-items'); container.replaceChildren();
  if (!state.cart.size) container.append(element('p', 'empty-cart', 'Här samlas plagg du vill titta närmare på. Spara ett plagg med + Varukorg.'));
  const cartGroups = checkoutGroups([...state.cart.values()]);
  for (const group of cartGroups) {
    const section = element('section', 'cart-store');
    const header = element('div', 'cart-store-top'); header.append(element('h3', 'cart-store-name', group.name));
    const checkoutLink = storeCheckoutAction(group.store);
    if (checkoutLink) header.append(checkoutLink);
    section.append(header);
    if (checkoutLink) section.append(element('p', 'small muted store-checkout-note', 'För över valda varor och leveransprofil med Safari-kopplingen. Du granskar och betalar hos Lindex.'));
    for (const product of group.items) {
      const row = element('article', 'cart-row');
      const content = element('div'); content.append(element('p', 'brand', product.brand || product.store), element('h3', '', product.name), element('p', 'small muted', `${product.quantity} st${product.size ? ` · storlek ${product.size}` : ''}`), element('p', 'price', money(product.totalMinor / 100)), externalLink(product.url, 'Öppna i butik ↗', 'store-link'));
      const remove = button('Ta bort', () => toggleCart(product), 'text-button'); remove.setAttribute('aria-label', `Ta bort ${product.name}`);
      content.append(sizePills(product)); row.append(content, remove); section.append(row);
    }
    container.append(section);
  }
  $('#cart-total').textContent = state.cart.size ? `Varusumma: ${money(cartGroups.reduce((sum, group) => sum + group.subtotalMinor, 0) / 100)}` : '';
  $('#cart-checkout-button').disabled = !state.cart.size;
  syncCheckout([...state.cart.values()], toggleCart, updated => {
    const fresh = new Map(updated.map(product => [product.id, product]));
    for (const product of updated) if (state.cart.has(product.id)) state.cart.set(product.id, product);
    for (const group of state.groups) group.pool = group.pool.map(product => fresh.get(product.id) ?? product);
    renderCart(); renderGroups();
  });
}
function renderGroups(previousPositions) {
  updateFavoriteState();
  const results = $('#results'); results.replaceChildren();
  if (!state.groups.length) { results.append(element('p', 'welcome', 'Inga grupper hittades. Prova en annan sökning.')); return; }
  const count = state.groups.reduce((sum, group) => sum + visible(group).length, 0);
  results.append(element('p', 'results-label', `${count} plagg att upptäcka · ${state.groups.length} grupper`));
  for (const group of state.groups) {
    const section = element('section', 'result-group'); section.setAttribute('aria-busy', String(group.busy));
    const header = element('div', 'group-header'), title = element('div');
    title.append(element('p', 'eyebrow', 'UTVALT FÖR DIN SÖKNING'), element('h2', '', group.category));
    const actions = element('div', 'group-actions');
    if (group.pool.length > 4 || group.count > 4) actions.append(button(group.count === 4 ? 'Visa fler' : 'Visa färre', () => { group.count = group.count === 4 ? 8 : 4; renderGroups(); }, 'outline'));
    actions.append(button('Ändra', () => editGroup(group, section), 'outline'), button(group.busy ? 'Letar…' : 'Nya förslag ↻', () => refreshGroup(group), 'outline'));
    actions.querySelectorAll('button').forEach(node => { node.disabled = group.busy; });
    header.append(title, actions); section.append(header);
    section.append(element('p', 'group-meta', `${group.pinned.size} hjärtmarkerade · ${new Set(visible(group).map(product => product.brand || product.store)).size} märken`));
    if (group.notice) section.append(element('p', 'notice', group.notice));
    const grid = element('div', 'product-grid');
    for (const product of visible(group)) grid.append(productCard(product, group));
    if (!visible(group).length) grid.append(element('p', 'empty-results', 'Inga säkra matchningar just nu. Prova en annan färg, plaggtyp eller ett märke.'));
    section.append(grid);
    const more = button(group.busy ? 'Letar…' : favorites.ids().length ? 'Nya förslag utifrån mina favoriter ↻' : 'Nya förslag ↻', () => refreshGroup(group, { personalized: true }), 'outline favorite-suggestions');
    more.disabled = group.busy; section.append(more);
    const extend = button('Utforska närliggande färger ↗', () => refreshGroup(group, { extend: true }), 'text-button extend'); extend.disabled = group.busy;
    section.append(extend); results.append(section);
  }
  if (previousPositions && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const card of results.querySelectorAll('[data-card-key]')) {
      const old = previousPositions.get(card.dataset.cardKey); if (!old) continue;
      const next = card.getBoundingClientRect(); card.classList.add('favorite-shift');
      card.animate([{ transform: `translate(${old.x - next.x}px,${old.y - next.y}px)` }, { transform: 'translate(0,0)' }], { duration: 440, easing: 'cubic-bezier(.22,.7,.2,1)' });
    }
  }
}
function editGroup(group, section) {
  if (section.querySelector('.edit-form')) return;
  const form = element('form', 'edit-form'), label = element('label', '', 'Ändra denna sökgrupp');
  const input = element('input'); input.value = group.sourceQuery; input.maxLength = 500; input.required = true; label.append(input);
  const save = element('button', 'primary', 'Spara sökning'); save.type = 'submit';
  form.append(label, save, button('Avbryt', () => form.remove(), 'outline'));
  form.addEventListener('submit', event => { event.preventDefault(); if (input.value.trim()) refreshGroup(group, { query: input.value.trim() }); });
  section.insertBefore(form, section.children[1]); input.focus(); input.select();
}
async function refreshGroup(group, { query = group.sourceQuery, extend = false, personalized = false } = {}) {
  if (group.busy) return;
  group.busy = true; errorMessage(); renderGroups();
  const generation = state.searchId;
  try {
    const retain = query === group.sourceQuery && extend === Boolean(group.extended);
    const exclusions = retain && !extend ? [...new Set([...group.pinned, ...group.dismissed, ...visible(group).map(product => product.id)])] : retain ? [...group.pinned] : [];
    const seeds = personalized ? favorites.ids().slice(-40) : [];
    const data = await request('search', { query, excludeProductIds: exclusions.slice(-200), extendSearch: extend, favoriteProductIds: seeds });
    if (generation !== state.searchId || !state.groups.includes(group)) return;
    const incoming = data.groups[0];
    catalogueNote(data.catalogue);
    if (!incoming) throw new Error('Sökningen gav ingen grupp.');
    if (retain && !incoming.products.length) {
      announce('Inga fler matchande plagg hittades. Dina nuvarande förslag visas fortfarande.');
    } else {
      const dismissed = retain && !extend ? new Set([...group.dismissed, ...visible(group).filter(product => !group.pinned.has(product.id)).map(product => product.id)].slice(-180)) : new Set();
      const merged = mergeRefresh(retain ? group : { ...group, pinned: new Set() }, incoming, query); Object.assign(group, merged, { dismissed, extended: extend });
      if (extend) group.count = 8;
      announce(seeds.length ? 'Nya förslag utifrån dina favoriter. Sökningens färg och plaggtyp är kvar.' : 'Förslagen är uppdaterade. Dina hjärtmarkerade plagg är kvar.');
    }
  } catch (error) { if (generation === state.searchId) errorMessage(error.message); }
  finally { group.busy = false; if (generation === state.searchId) renderGroups(); }
}
async function findSimilar(product) {
  const generation = ++state.similarId;
  const dialog = $('#similar-dialog'), items = $('#similar-items');
  $('#similar-title').textContent = `Liknande ${product.name}`; items.replaceChildren(element('p', 'notice', 'Letar efter liknande plagg…'));
  if (!dialog.open) dialog.showModal();
  try {
    const data = await request('similar', { referenceProductId: product.id });
    if (generation !== state.similarId || !dialog.open) return;
    items.replaceChildren();
    for (const item of data.products) items.append(productCard(item));
    if (!data.products.length) items.append(element('p', 'notice', 'Inga tillräckligt lika plagg hittades i katalogen.'));
  } catch (error) { if (generation === state.similarId && dialog.open) items.replaceChildren(element('p', 'error', error.message)); }
}
async function search(query) {
  query = query.trim(); if (!query) return;
  state.controller?.abort(); const controller = new AbortController(); state.controller = controller;
  const generation = ++state.searchId;
  $('#search').value = query; $('#search-submit').disabled = true; $('#search-submit').textContent = 'Letar…';
  $('#results').setAttribute('aria-busy', 'true'); announce('Letar efter plagg och kontrollerar storlekar och lager…'); errorMessage();
  try {
    const data = await request('search', { query }, AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]));
    if (generation !== state.searchId) return;
    state.groups = data.groups.map(makeGroup); renderGroups();
    catalogueNote(data.catalogue);
    announce('Sökningen är klar. Pris och lager bekräftas i respektive butik.');
    $('#results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  } catch (error) { if (generation === state.searchId && error.name !== 'AbortError') { announce(''); errorMessage(error.message); } }
  finally { if (generation === state.searchId) { $('#search-submit').disabled = false; $('#search-submit').textContent = 'Hitta plagg ↗'; $('#results').setAttribute('aria-busy', 'false'); } }
}
$('#search-form').addEventListener('submit', event => { event.preventDefault(); search($('#search').value); });
$('#search').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); search($('#search').value); } });
$('#examples').addEventListener('click', event => { if (event.target.tagName === 'BUTTON') search(event.target.textContent); });
$('#cart-open').addEventListener('click', () => { renderCart(); $('#cart-dialog').showModal(); });
$('#favorites-open').addEventListener('click', openFavorites);
$('#favorites-dialog').addEventListener('close', () => { favoritesGeneration++; });
$('#favorite-nudge-close').addEventListener('click', () => { $('#favorite-nudge').hidden = true; });
function favoriteLogin() { $('#favorite-nudge').hidden = true; $('#favorites-dialog').close(); openAccount(); }
$('#favorite-nudge-login').addEventListener('click', favoriteLogin);
$('#favorites-login').addEventListener('click', favoriteLogin);
$('#favorites-save-account').addEventListener('click', async () => {
  if (favoriteSaving) return; favoriteSaving = true;
  try { await saveAccountFavorites(favoriteIds([...favorites.localIds(), ...favorites.accountIds()])); favorites.clearLocal(); updateFavoriteState(); renderFavorites(); $('#favorites-feedback').textContent = 'Favoriterna är sparade på kontot.'; }
  catch (error) { $('#favorites-feedback').textContent = error.message; }
  finally { favoriteSaving = false; }
});
$('#privacy-open').addEventListener('click', () => $('#privacy-dialog').showModal());
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
});
$('#similar-dialog').addEventListener('close', () => { state.similarId++; });
$('#checkout-dialog').addEventListener('close', () => { renderCart(); renderGroups(); });
$('#cart-profile-button').addEventListener('click', openAccount);
$('#cart-checkout-button').addEventListener('click', openCheckout);
$('#cart-stock-refresh').addEventListener('click', refreshCheckoutStock);
document.addEventListener('whool-account-changed', () => {
  const account = getAccountState(); favorites.setAccount(account.authenticated ? account.userId : null, account.favoriteIds);
  updateFavoriteState(); if (state.groups.length && !favoriteSaving) renderGroups(); renderFavorites();
  const saved = getDeliveryProfile();
  $('#cart-profile-summary').textContent = saved ? `${saved.demo ? 'Testprofil · ' : ''}${saved.profile.firstName} ${saved.profile.lastName} · ${saved.profile.postalCode} ${saved.profile.city}` : 'Lägg till en profil för att slippa skriva samma uppgifter igen.';
});
updateFavoriteState();
