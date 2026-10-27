import { profileFields, normalizeProfile, validateEmail, autofillValues } from './profile.js';

const demoProfile = { firstName: 'Alex', lastName: 'Exempel', phone: '+46700000000', addressLine1: 'Exempelgatan 1', addressLine2: '', postalCode: '12345', city: 'Exempelstad', countryCode: 'SE' };
const $ = selector => document.querySelector(selector);
const state = { enabled: false, authenticated: false, demo: false, profile: null, email: '', userId: null, favoriteIds: [], loading: false, generation: 0 };
function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
async function accountRequest(body) {
  const response = await fetch('/api/account', { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10_000), body: body ? JSON.stringify(body) : undefined });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Kontot kunde inte uppdateras.'); return result;
}
function message(text, error = false) {
  const item = $('#account-message'); item.textContent = text; item.className = error ? 'error' : 'notice'; item.hidden = !text;
  item.setAttribute('role', error ? 'alert' : 'status');
}
function field(parent, { key, label, autocomplete, max, type = 'text', optional = false }, profile, prefix = 'profile') {
  const wrapper = node('label', key.startsWith('address') ? 'field wide' : 'field', label);
  const input = node('input'); input.name = key; input.id = `${prefix}-${key}`; input.type = type; input.autocomplete = autocomplete; input.maxLength = max; input.required = !optional; input.value = profile?.[key] ?? '';
  if (key === 'postalCode') input.inputMode = 'numeric';
  wrapper.append(input); parent.append(wrapper); return input;
}
function readProfile(form) {
  const values = Object.fromEntries(new FormData(form));
  return normalizeProfile(Object.fromEntries([...profileFields.map(item => [item.key, values[item.key]]), ['countryCode', 'SE']]));
}
function renderFields() {
  const form = $('#profile-form'); form.replaceChildren();
  const grid = node('div', 'profile-grid');
  const emailField = node('label', 'field wide', 'E-postadress');
  const emailInput = node('input'); emailInput.type = 'email'; emailInput.name = 'email'; emailInput.autocomplete = 'email'; emailInput.maxLength = 254; emailInput.required = true; emailInput.value = state.email; emailInput.readOnly = !state.demo;
  emailField.append(emailInput); grid.append(emailField);
  for (const item of profileFields) field(grid, item, state.profile);
  const country = node('label', 'field wide', 'Land'); const countryValue = node('input'); countryValue.value = 'Sverige'; countryValue.readOnly = true; countryValue.autocomplete = 'country-name'; country.append(countryValue); grid.append(country);
  const actions = node('div', 'profile-actions'); const save = node('button', 'primary', state.demo ? 'Spara i testflödet' : 'Spara mina uppgifter'); save.type = 'submit';
  actions.append(save); form.append(grid, actions);
}
function render() {
  $('#autofill-demo-form').reset(); $('#autofill-result').textContent = '';
  const signedIn = state.authenticated || state.demo;
  $('#account-login').hidden = signedIn;
  $('#account-profile').hidden = !signedIn;
  $('#account-login-form').hidden = !state.enabled;
  $('#account-unavailable').hidden = state.enabled;
  $('#account-demo-note').hidden = !state.demo;
  $('#account-delete').hidden = !state.profile;
  $('#account-open').textContent = state.authenticated ? 'Mitt konto ✓' : state.demo ? 'Testprofil' : 'Mitt konto';
  $('#profile-summary').textContent = state.demo ? 'Fiktiv testprofil · försvinner när sidan laddas om' : state.email ? `Inloggad som ${state.email}` : '';
  $('#account-signout').textContent = state.demo ? 'Avsluta testprofil' : 'Logga ut';
  if (signedIn) renderFields();
  else $('#profile-form').replaceChildren();
  document.dispatchEvent(new Event('whool-account-changed'));
}
export function getDeliveryProfile() { return state.profile ? { profile: { ...state.profile }, email: state.email, demo: state.demo } : null; }
export function getAccountState() { return { enabled: state.enabled, authenticated: state.authenticated, demo: state.demo, userId: state.userId, favoriteIds: [...state.favoriteIds] }; }
export async function saveAccountFavorites(productIds) {
  if (!state.authenticated || !state.userId) throw new Error('Logga in för att spara på kontot.');
  const userId = state.userId;
  const result = await accountRequest({ action: 'save-favorites', productIds });
  if (state.userId !== userId || !state.authenticated) throw new Error('Kontot ändrades. Försök igen.');
  state.favoriteIds = result.favoriteIds;
  document.dispatchEvent(new Event('whool-account-changed'));
  return result.favoriteIds;
}
export async function openAccount() {
  const dialog = $('#account-dialog'); if (!dialog.open) dialog.showModal();
  if (state.demo || state.loading) { render(); return; }
  state.loading = true; const generation = ++state.generation; message('Hämtar kontostatus…');
  try {
    const status = await accountRequest(); if (generation !== state.generation) return;
    Object.assign(state, status); if (!status.authenticated) state.email = ''; message(status.enabled ? '' : 'Riktig kontolagring är inte aktiverad ännu. Du kan prova gränssnittet med fiktiva uppgifter.'); render();
  } catch { if (generation === state.generation) { state.enabled = false; render(); message('Kontotjänsten kunde inte nås. Inga uppgifter har skickats till någon butik.', true); } }
  finally { state.loading = false; }
}
export function openAutofillDemo() {
  const saved = getDeliveryProfile();
  if (!saved) { openAccount(); message('Lägg först till en leveransprofil. I testläget använder du fiktiva uppgifter.'); return; }
  const dialog = $('#autofill-dialog'), form = $('#autofill-demo-form'); form.reset();
  $('#autofill-result').textContent = 'Fälten är tomma. Klicka på knappen för att testa ifyllningen.';
  $('#autofill-run').disabled = false; if (!dialog.open) dialog.showModal();
}
function initializeAccount() {
  $('#account-open').addEventListener('click', openAccount);
  $('#account-autofill-demo').addEventListener('click', openAutofillDemo);
  $('#account-demo').addEventListener('click', () => {
    ++state.generation; Object.assign(state, { demo: true, authenticated: false, email: 'alex@example.com', profile: { ...demoProfile }, userId: null, favoriteIds: [] });
    message('Testläge med fiktiva uppgifter. Inget konto skapas och ingen information sparas på servern.'); render();
  });
  $('#account-login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (state.loading) return;
    const email = $('#login-email').value.trim(); if (!validateEmail(email)) { message('Ange en giltig e-postadress.', true); return; }
    state.loading = true; const submit = event.submitter; submit.disabled = true; $('#account-demo').disabled = true;
    try { await accountRequest({ action: 'send-code', email }); state.email = email; $('#account-code-form').hidden = false; $('#login-code').value = ''; $('#login-code').focus(); message('Kontrollera din e-post och ange engångskoden.'); }
    catch (error) { message(error.message, true); }
    finally { state.loading = false; submit.disabled = false; $('#account-demo').disabled = false; }
  });
  $('#account-code-form').addEventListener('submit', async event => {
    event.preventDefault(); if (state.loading) return; state.loading = true; event.submitter.disabled = true; $('#account-demo').disabled = true;
    try {
      await accountRequest({ action: 'verify-code', email: state.email, code: $('#login-code').value.trim() });
      Object.assign(state, await accountRequest(), { demo: false }); $('#login-code').value = ''; $('#account-code-form').hidden = true; message('Du är inloggad. Lägg till dina leveransuppgifter.'); render();
    } catch (error) { message(error.message, true); }
    finally { state.loading = false; event.submitter.disabled = false; $('#account-demo').disabled = false; }
  });
  $('#profile-form').addEventListener('submit', async event => {
    event.preventDefault(); if (state.loading) return;
    let profile, email;
    try { profile = readProfile(event.currentTarget); email = new FormData(event.currentTarget).get('email'); if (!validateEmail(email)) throw new Error('Ange en giltig e-postadress.'); }
    catch (error) { message(error.message, true); return; }
    state.loading = true; event.submitter.disabled = true;
    try {
      if (state.demo) { state.profile = profile; state.email = email; }
      else { const result = await accountRequest({ action: 'save-profile', profile }); state.profile = result.profile; }
      message(state.demo ? 'Testprofilen är uppdaterad i denna flik. Ingen kontolagring eller överföring har gjorts.' : 'Dina leveransuppgifter är sparade på ditt konto.'); render();
    } catch (error) { message(error.message, true); }
    finally { state.loading = false; event.submitter.disabled = false; }
  });
  $('#account-signout').addEventListener('click', async () => {
    if (state.loading) return;
    const wasDemo = state.demo; state.loading = true;
    try {
      if (!wasDemo) await accountRequest({ action: 'logout' });
      ++state.generation; Object.assign(state, { demo: false, authenticated: false, profile: null, email: '', userId: null, favoriteIds: [] }); $('#profile-form').reset(); $('#login-email').value = ''; $('#login-code').value = ''; $('#account-code-form').hidden = true; render(); message(wasDemo ? 'Testprofilen är borttagen ur denna flik.' : 'Du är utloggad på den här sidan.');
    } catch { state.profile = null; state.email = ''; render(); message('Utloggningen kunde inte bekräftas. Profilen är dold i denna flik. Försök att logga ut igen.', true); }
    finally { state.loading = false; }
  });
  $('#account-delete').addEventListener('click', () => { $('#account-delete-confirm').hidden = false; });
  $('#account-delete-cancel').addEventListener('click', () => { $('#account-delete-confirm').hidden = true; });
  $('#account-delete-confirm-button').addEventListener('click', async () => {
    if (state.loading) return; state.loading = true;
    try {
      if (!state.demo) await accountRequest({ action: 'delete-profile' });
      state.profile = null; $('#account-delete-confirm').hidden = true; message(state.demo ? 'Testuppgifterna är borttagna.' : 'Leveransuppgifterna är raderade. Inloggningskontot finns kvar.'); render();
    } catch (error) { message(error.message, true); }
    finally { state.loading = false; }
  });
  $('#autofill-run').addEventListener('click', () => {
    const saved = getDeliveryProfile(); if (!saved) return;
    const values = autofillValues(saved.profile, saved.email), form = $('#autofill-demo-form');
    for (const field of form.elements) if (field.name && typeof values[field.name] === 'string') field.value = values[field.name];
    $('#autofill-result').textContent = 'Kontakt- och adressfälten är ifyllda. Leveransväljarens postnummer stämmer med profilen. Inga uppgifter har överförts till en extern butik.';
  });
  $('#autofill-demo-form').addEventListener('input', () => {
    const form = $('#autofill-demo-form');
    if (form.elements.deliveryPostalCode.value && form.elements.deliveryPostalCode.value.replace(/\s/g, '') !== form.elements.postalCode.value.replace(/\s/g, '')) $('#autofill-result').textContent = 'Kontrollera leveransen: leveransväljarens postnummer skiljer sig från adressens. Ingen extern körning görs i denna demo.';
  });
  $('#autofill-demo-form').addEventListener('submit', event => event.preventDefault());
  render();
  if (['http:', 'https:'].includes(location.protocol)) {
    const generation = state.generation;
    accountRequest().then(status => { if (generation === state.generation && !state.loading && !state.demo) { Object.assign(state, status); render(); } }).catch(() => {});
  }
}
initializeAccount();
