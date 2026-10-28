import { COLOR_OPTIONS, PATTERN_OPTIONS, EVIDENCE_OPTIONS, createReviewWorkspace, colorLabel, effectiveColor } from './studio-model.js';

const $ = selector => document.querySelector(selector);
const statusNames = { flagged: 'Färgflagga', unreviewed: 'Ej bedömd', draft: 'Utkast', pending: 'Att granska', approved: 'Godkänd i skissen', changes_requested: 'Ny bedömning' };
const categoryNames = { sweater: 'Tröja', 't-shirt': 'T-shirt', pants: 'Byxor', jacket: 'Jacka', dress: 'Klänning', body: 'Body', overall: 'Overall', fleece: 'Fleece', shirt: 'Skjorta' };
const verdictNames = { unreviewed: 'Ej bedömd', yes: 'Passar', no: 'Passar inte', uncertain: 'Osäker' };
const money = value => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value);
const timeLabel = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const state = { workspace: null, selected: null, filter: 'all', search: '', pane: 'terms', activeTerm: 'rolig' };
let toastTimer;
function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
function button(text, action, className = '') { const item = node('button', className, text); item.type = 'button'; item.addEventListener('click', action); return item; }
function https(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
function swatch(id, className = 'mini-swatch') { const item = node('span', className); item.dataset.color = id; item.setAttribute('aria-hidden', 'true'); return item; }
function pressed(item, value) { item.setAttribute('aria-pressed', String(value)); }
function record() { return state.workspace.record(state.selected); }
function toast(text, error = false) {
  clearTimeout(toastTimer); const item = $('#studio-toast'); item.textContent = text; item.hidden = false; item.dataset.error = String(error);
  toastTimer = setTimeout(() => { item.hidden = true; }, 5500);
}
function showError(error) { $('#studio-error').textContent = error.message || 'Kontrollera uppgifterna.'; $('#studio-error').hidden = false; toast($('#studio-error').textContent, true); }
function clearError() { $('#studio-error').hidden = true; }
function updateDraft(change) {
  const review = record().draft; change(review); state.workspace.update(state.selected, review); clearError(); renderQueue(); renderStatus(); renderPreview();
}
function visibleQueue() {
  const query = state.search.toLocaleLowerCase('sv');
  return state.workspace.list().filter(item => (state.filter === 'all' || item.status === state.filter) && (!query || [item.product.name, item.product.brand, item.product.retailer, item.product.id].join(' ').toLocaleLowerCase('sv').includes(query)));
}
function renderQueue() {
  const all = state.workspace.list(), items = visibleQueue(), filters = $('#queue-filters'); filters.replaceChildren();
  for (const [id, label] of [['all', 'Alla'], ['flagged', 'Färgflagga'], ['unreviewed', 'Okodade'], ['draft', 'Utkast'], ['pending', 'Att granska'], ['approved', 'Godkända'], ['changes_requested', 'Ny bedömning']]) {
    const count = id === 'all' ? all.length : all.filter(item => item.status === id).length;
    if (['draft', 'changes_requested'].includes(id) && !count && state.filter !== id) continue;
    const control = button(label, () => { state.filter = id; renderQueue(); }, 'queue-filter');
    control.append(node('span', '', String(count))); pressed(control, state.filter === id); filters.append(control);
  }
  $('#queue-count').textContent = String(items.length);
  const queue = $('#product-queue'); queue.replaceChildren();
  for (const item of items) {
    const product = item.product, control = button('', () => selectProduct(product.id), 'queue-product');
    control.setAttribute('aria-current', String(product.id === state.selected)); control.setAttribute('aria-label', product.name + ', ' + statusNames[item.status]);
    const image = node('img'); image.src = https(product.image); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    const info = node('div'); info.append(node('p', 'queue-brand', product.brand), node('p', 'queue-name', product.name), node('span', 'queue-status ' + item.status, statusNames[item.status]));
    control.append(image, info); queue.append(control);
  }
  if (!items.length) queue.append(node('p', 'muted small', 'Inga exempel i urvalet. Ditt öppna plagg finns kvar.'));
}
function navigate(direction) {
  const items = visibleQueue(), index = items.findIndex(item => item.product.id === state.selected);
  if (!items.length) return;
  const next = index < 0 ? 0 : (index + direction + items.length) % items.length;
  selectProduct(items[next].product.id);
}
function selectProduct(id) {
  state.selected = id; clearError(); const item = record(), product = item.product;
  const image = $('#reference-image'); image.src = https(product.image); image.alt = product.name;
  $('#reference-brand').textContent = product.brand;
  $('#reference-name').textContent = product.name;
  $('#reference-retailer').textContent = 'Säljs hos ' + product.retailer;
  $('#reference-price').textContent = money(product.referencePrice);
  $('#reference-link').href = https(product.url);
  $('#reference-description').textContent = product.sourceDescription || 'Ingen ytterligare beskrivning i underlaget.';
  $('#reference-id').textContent = 'Produktreferens ' + product.id + ' · katalogunderlag ' + new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'medium' }).format(new Date(product.catalogueDate));
  $('#reference-flag').hidden = !product.flags.length;
  const facts = $('#reference-facts'); facts.replaceChildren(node('span', 'fact-chip', categoryNames[product.category] || product.category), node('span', 'fact-chip', 'Whool: ' + colorLabel(product.currentColorId)));
  $('#review-position').textContent = String(state.workspace.list().findIndex(item => item.product.id === id) + 1) + ' / ' + state.workspace.list().length;
  renderQueue(); renderColor(); renderTerms(); renderHistory(); renderStatus(); renderPreview(); setPane(state.pane);
}
function renderColor() {
  const item = record(), product = item.product, color = item.draft.color;
  const imported = $('#imported-color'); imported.replaceChildren(swatch(product.importedColorId), document.createTextNode(COLOR_OPTIONS.some(option => option[0] === product.importedColor) ? colorLabel(product.importedColor) : product.importedColor || 'Saknas'));
  const current = $('#current-color'); current.replaceChildren(swatch(product.currentColorId), document.createTextNode(colorLabel(product.currentColorId)));
  $('#color-flag-message').hidden = !product.flags.length; $('#color-flag-message').textContent = product.flags.join(' ');
  $('#color-verdicts').querySelectorAll('button').forEach(control => pressed(control, color.verdict === control.dataset.verdict || control.dataset.verdict === 'flagged' && color.verdict === 'corrected'));
  const palette = $('#primary-colors'); palette.replaceChildren();
  for (const [id, label] of COLOR_OPTIONS) {
    const control = button('', () => {
      updateDraft(review => {
        review.color.primary = id; review.color.secondary = review.color.secondary.filter(value => value !== id);
        review.color.verdict = id === 'unknown' ? 'uncertain' : id === product.importedColorId ? 'confirmed' : 'corrected';
        if (review.color.verdict === 'corrected' && !review.color.reason) review.color.reason = ['red', 'burgundy'].includes(id) && ['red', 'burgundy'].includes(product.importedColorId) ? 'wrong_shade' : 'wrong_family';
      }); renderColor();
    }, 'color-option');
    control.setAttribute('aria-label', label + ' som huvudfärg'); pressed(control, color.primary === id);
    control.append(swatch(id, 'swatch'), node('span', '', label)); palette.append(control);
  }
  $('#proposed-color-label').textContent = colorLabel(color.primary);
  $('#color-issue-fields').hidden = !['flagged', 'corrected'].includes(color.verdict);
  $('#color-reason').value = color.reason; $('#color-note').value = color.note; $('#color-coverage').value = color.coverage;
  const secondary = $('#secondary-colors'); secondary.replaceChildren();
  for (const [id, label] of COLOR_OPTIONS.filter(item => !['mixed', 'unknown'].includes(item[0]))) {
    const control = button('', () => {
      updateDraft(review => { review.color.secondary = review.color.secondary.includes(id) ? review.color.secondary.filter(value => value !== id) : [...review.color.secondary, id].slice(0, 6); }); renderColor();
    }, 'secondary-option');
    control.disabled = id === color.primary; pressed(control, color.secondary.includes(id)); control.setAttribute('aria-label', label + ' som andra färg');
    control.append(swatch(id), document.createTextNode(label)); secondary.append(control);
  }
  const patterns = $('#pattern-options'); patterns.replaceChildren();
  for (const [id, label] of PATTERN_OPTIONS) {
    const control = button(label, () => {
      updateDraft(review => {
        review.patterns = review.patterns.includes(id) ? review.patterns.filter(value => value !== id) : id === 'solid' ? ['solid'] : [...review.patterns.filter(value => value !== 'solid'), id];
        review.patternVerdict = review.patterns.length ? 'confirmed' : 'unreviewed';
      }); renderColor();
    }, 'chip');
    control.dataset.pattern = id; pressed(control, item.draft.patterns.includes(id)); patterns.append(control);
  }
  $('#pattern-uncertain').textContent = item.draft.patternVerdict === 'uncertain' ? 'Markerat som osäkert' : 'Osäker';
}
function renderTerms() {
  const draft = record().draft, terms = state.workspace.terms();
  if (!terms.some(term => term.id === state.activeTerm)) state.activeTerm = terms[0].id;
  const tabs = $('#term-tabs'); tabs.replaceChildren();
  for (const term of terms) {
    const selected = draft.terms[term.id].verdict === 'yes';
    const control = button('', () => {
      const hadFocus = document.activeElement === control;
      updateDraft(review => { review.terms[term.id].verdict = review.terms[term.id].verdict === 'yes' ? 'unreviewed' : 'yes'; });
      state.activeTerm = term.id; renderTerms();
      if (hadFocus) document.querySelector('[data-tag-id="' + term.id + '"]').focus();
    }, 'product-tag');
    control.dataset.tagId = term.id; control.setAttribute('aria-label', term.name); control.title = term.definition;
    pressed(control, selected);
    const indicator = node('span', 'tag-indicator', selected ? '✓' : '+'); indicator.setAttribute('aria-hidden', 'true');
    control.append(indicator, node('span', '', term.name)); tabs.append(control);
  }
  const selectedTerms = terms.filter(term => draft.terms[term.id].verdict === 'yes');
  $('#tag-selection-summary').textContent = selectedTerms.length ? selectedTerms.length + (selectedTerms.length === 1 ? ' tagg vald' : ' taggar valda') + ' · ' + selectedTerms.map(term => term.name).join(', ') : 'Inga taggar valda ännu.';
  const detailSelect = $('#detail-term'); detailSelect.replaceChildren();
  for (const term of terms) { const option = node('option', '', term.name); option.value = term.id; detailSelect.append(option); }
  detailSelect.value = state.activeTerm;
  const term = terms.find(term => term.id === state.activeTerm), value = draft.terms[term.id];
  $('#active-term-name').textContent = term.name; $('#active-term-definition').textContent = term.definition;
  $('#term-verdict-label').textContent = 'Passar ”' + term.name.toLocaleLowerCase('sv') + '” på det här plagget?';
  $('#term-verdicts').querySelectorAll('button').forEach(control => pressed(control, control.dataset.termVerdict === value.verdict));
  $('#positive-term-fields').hidden = value.verdict !== 'yes';
  $('#term-strength').querySelectorAll('button').forEach(control => pressed(control, Number(control.dataset.strength) === value.strength));
  const evidence = $('#term-evidence'); evidence.replaceChildren();
  for (const [id, label] of EVIDENCE_OPTIONS) {
    const control = button(label, () => {
      updateDraft(review => {
        const active = review.terms[state.activeTerm], selected = active.evidence.includes(id);
        active.evidence = selected ? active.evidence.filter(value => value !== id) : [...active.evidence, id];
        if (!selected && ['dots', 'stripes'].includes(id)) {
          const pattern = id === 'dots' ? 'dotted' : 'striped';
          review.patterns = [...new Set([...review.patterns.filter(value => value !== 'solid'), pattern])]; review.patternVerdict = 'confirmed';
        }
      }); renderTerms();
    }, 'chip');
    control.dataset.evidence = id; pressed(control, value.evidence.includes(id)); evidence.append(control);
  }
  $('#term-note').value = value.note;
}
function renderStatus() {
  if (!state.workspace || !state.selected) return;
  const item = record(), status = item.status, role = $('#review-role').value, latest = item.revisions.at(-1);
  $('#record-status').textContent = statusNames[status]; $('#record-status').className = 'status-badge ' + status;
  $('#save-state-title').textContent = statusNames[status];
  $('#save-state-note').textContent = status === 'pending' ? 'Förslaget väntar på testrollen Granskare.' : status === 'approved' ? 'Godkänd i skissen. Katalogen är oförändrad.' : status === 'draft' ? 'Utkastet finns kvar när du byter plagg.' : 'Alla ändringar stannar i skissen.';
  $('#save-status-dot').className = 'save-status-dot ' + status;
  $('#save-review').disabled = ['pending', 'approved'].includes(status);
  $('#approve-review').hidden = role !== 'reviewer' || status !== 'pending';
  $('#reset-review').disabled = status !== 'draft';
  $('#export-reviews').disabled = !state.workspace.export().proposals.length;
  $('#history-count').textContent = String(item.history.length);
  $('#term-reviewed-count').textContent = String(Object.values(item.draft.terms).filter(value => value.verdict === 'yes').length);
  if (latest && state.pane === 'history') renderHistory();
}
function renderPreview() {
  const item = record(), draft = item.draft, color = draft.color, container = $('#effect-preview'), chips = node('div', 'effect-chips');
  if (['confirmed', 'corrected'].includes(color.verdict)) {
    chips.append(node('span', 'effect-chip', 'Huvudfärg: ' + colorLabel(effectiveColor(draft, item.product))));
    if (color.primary === 'burgundy') chips.append(node('span', 'effect-chip', 'Ingår i rött · vinröd nyans'));
  } else if (color.verdict === 'flagged') chips.append(node('span', 'effect-chip flagged', 'Färgfel anmält · rättning saknas'));
  else if (color.verdict === 'uncertain') chips.append(node('span', 'effect-chip flagged', 'Färg: osäker · ingen rättning'));
  if (draft.patternVerdict === 'confirmed') for (const pattern of draft.patterns) chips.append(node('span', 'effect-chip', PATTERN_OPTIONS.find(item => item[0] === pattern)[1]));
  if (draft.patternVerdict === 'uncertain') chips.append(node('span', 'effect-chip flagged', 'Mönster: osäkert'));
  for (const term of state.workspace.terms()) {
    const value = draft.terms[term.id]; if (value.verdict === 'unreviewed') continue;
    const label = term.name + ': ' + (value.verdict === 'yes' ? ['Lite', 'Tydligt', 'Mycket'][value.strength - 1].toLocaleLowerCase('sv') : verdictNames[value.verdict].toLocaleLowerCase('sv'));
    chips.append(node('span', value.verdict === 'yes' ? 'effect-chip' : 'effect-chip unchanged', label));
  }
  if (!chips.children.length) chips.append(node('span', 'effect-chip unchanged', 'Ännu ingen ny kodning'));
  container.replaceChildren(chips);
}
function renderHistory() {
  const item = record(), container = $('#review-history'); container.replaceChildren();
  const events = [...item.history].reverse();
  for (const event of events) {
    const block = node('div', 'history-item');
    block.append(node('h4', '', event.action === 'proposed' ? 'Förslag sparat · version ' + event.revision : event.action === 'approved' ? 'Godkänd i skissen' : 'Ny bedömning efterfrågad'), node('p', '', timeLabel(event.at) + ' · ' + (event.role === 'reviewer' ? 'Granskare' : 'Kodare') + ' (testroll)'));
    if (event.action === 'proposed') {
      const review = item.revisions.find(value => value.revision === event.revision).review;
      block.append(node('p', 'history-detail', 'Färg: ' + ({ unreviewed: 'ej bedömd', confirmed: 'bekräftad', flagged: 'felanmäld', corrected: 'föreslagen rättning', uncertain: 'osäker' }[review.color.verdict]) + (['confirmed', 'corrected'].includes(review.color.verdict) ? ' · ' + colorLabel(review.color.primary) : '')));
    }
    container.append(block);
  }
  const imported = node('div', 'history-item'); imported.append(node('h4', '', 'Källuppgifter i exempelkön'), node('p', '', 'Importerad färg: ' + item.product.importedColor + '. Ändringar sparas som nya förslag, utan att skriva över underlaget.')); container.append(imported);
}
function setPane(pane) {
  state.pane = pane;
  for (const key of ['color', 'terms', 'history']) { $('#pane-' + key).hidden = key !== pane; $('#tab-' + key).setAttribute('aria-selected', String(key === pane)); $('#tab-' + key).tabIndex = key === pane ? 0 : -1; }
  if (pane === 'history') renderHistory();
  if (pane === 'color') renderColor();
  if (pane === 'terms') renderTerms();
}
function saveReview() {
  try { state.workspace.save(state.selected, $('#review-role').value); clearError(); renderQueue(); renderStatus(); renderHistory(); toast('Förslaget är sparat i den här fliken. Katalogen är oförändrad.'); }
  catch (error) { showError(error); }
}
function openApproval() {
  const item = record(), revision = item.revisions.at(-1), container = $('#approval-summary'); container.replaceChildren();
  const color = node('div', 'approval-row'); color.append(node('strong', '', 'Färgbedömning'), node('p', '', 'Whool just nu: ' + colorLabel(item.product.currentColorId) + ' → ' + (['confirmed', 'corrected'].includes(revision.review.color.verdict) ? colorLabel(revision.review.color.primary) : revision.review.color.verdict === 'flagged' ? 'Färgfel rapporterat, ingen automatisk rättning' : 'Ingen ny färg bestämd'))); container.append(color);
  color.append(node('p', 'muted small', 'Importerad färg: ' + item.product.importedColor + (revision.review.color.note ? ' · ' + revision.review.color.note : '')));
  if (revision.review.patternVerdict !== 'unreviewed') {
    const patterns = node('div', 'approval-row'); patterns.append(node('strong', '', 'Mönster'), node('p', '', revision.review.patternVerdict === 'uncertain' ? 'Osäkert' : revision.review.patterns.map(id => PATTERN_OPTIONS.find(option => option[0] === id)[1]).join(', '))); container.append(patterns);
  }
  for (const term of revision.definitions) {
    const value = revision.review.terms[term.id]; if (value.verdict === 'unreviewed') continue;
    const line = node('div', 'approval-row'); line.append(node('strong', '', term.name), node('p', '', verdictNames[value.verdict] + (value.verdict === 'yes' ? ' · ' + ['lite', 'tydligt', 'mycket'][value.strength - 1] : '') + (value.note ? ' · ' + value.note : '')));
    if (value.verdict === 'yes' && value.evidence.length) line.append(node('p', 'muted small', 'Stöd: ' + value.evidence.map(id => EVIDENCE_OPTIONS.find(option => option[0] === id)[1]).join(', ')));
    container.append(line);
  }
  $('#approval-dialog').showModal();
}
function exportReviews() {
  const data = state.workspace.export();
  if (!data.proposals.length) { toast('Spara ett förslag först.'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'whool-granskningsforslag-' + new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date()) + '.json'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Förslagen har exporterats. Ingen verklig katalog har ändrats.');
}
function initialize() {
  $('#detail-term').addEventListener('change', event => { state.activeTerm = event.target.value; renderTerms(); });
  $('#queue-search').addEventListener('input', event => { state.search = event.target.value; renderQueue(); });
  $('#previous-product').addEventListener('click', () => navigate(-1));
  $('#next-product').addEventListener('click', () => navigate(1)); $('#next-product-top').addEventListener('click', () => navigate(1));
  $('#review-role').addEventListener('change', renderStatus);
  $('#color-verdicts').querySelectorAll('button').forEach(control => control.addEventListener('click', () => {
    updateDraft(review => { review.color.verdict = control.dataset.verdict; if (review.color.verdict === 'confirmed') review.color.primary = record().product.importedColorId; if (review.color.verdict === 'flagged' && !review.color.reason) review.color.reason = 'wrong_family'; }); renderColor();
  }));
  $('#color-reason').addEventListener('change', event => updateDraft(review => { review.color.reason = event.target.value; }));
  $('#color-note').addEventListener('input', event => updateDraft(review => { review.color.note = event.target.value; }));
  $('#color-coverage').addEventListener('change', event => updateDraft(review => { review.color.coverage = event.target.value; }));
  $('#pattern-uncertain').addEventListener('click', () => { updateDraft(review => { review.patternVerdict = 'uncertain'; review.patterns = []; }); renderColor(); });
  $('#term-verdicts').querySelectorAll('button').forEach(control => control.addEventListener('click', () => { updateDraft(review => { review.terms[state.activeTerm].verdict = control.dataset.termVerdict; }); renderTerms(); }));
  $('#term-strength').querySelectorAll('button').forEach(control => control.addEventListener('click', () => { updateDraft(review => { review.terms[state.activeTerm].strength = Number(control.dataset.strength); }); renderTerms(); }));
  $('#term-note').addEventListener('input', event => updateDraft(review => { review.terms[state.activeTerm].note = event.target.value; }));
  $('#save-review').addEventListener('click', saveReview);
  $('#reset-review').addEventListener('click', () => { state.workspace.reset(state.selected); selectProduct(state.selected); toast('Utkastet är återställt. Sparad historik finns kvar.'); });
  $('#approve-review').addEventListener('click', openApproval);
  $('#confirm-approval').addEventListener('click', () => {
    try { state.workspace.approve(state.selected, $('#review-role').value); $('#approval-dialog').close(); selectProduct(state.selected); toast('Godkänd i skissen. Katalogen har inte ändrats.'); } catch (error) { showError(error); }
  });
  $('#return-review').addEventListener('click', () => {
    try { state.workspace.returnForChanges(state.selected, $('#review-role').value); $('#approval-dialog').close(); selectProduct(state.selected); toast('Förslaget är markerat för en ny bedömning i skissen.'); } catch (error) { showError(error); }
  });
  $('#export-reviews').addEventListener('click', exportReviews);
  $('#enlarge-image').addEventListener('click', () => { const product = record().product; $('#large-product-image').src = https(product.image); $('#large-product-image').alt = product.name; $('#image-title').textContent = product.name; $('#image-dialog').showModal(); });
  $('#add-term-open').addEventListener('click', () => { $('#new-term-form').reset(); $('#new-term-error').hidden = true; $('#new-term-dialog').showModal(); $('#new-term-name').focus(); });
  $('#new-term-form').addEventListener('submit', event => {
    event.preventDefault();
    try { state.activeTerm = state.workspace.addTerm($('#new-term-name').value, $('#new-term-definition').value); $('#new-term-dialog').close(); renderTerms(); renderQueue(); renderStatus(); renderPreview(); toast('Taggen finns nu i skissen. Tryck på den för att tagga plagget.'); }
    catch (error) { $('#new-term-error').textContent = error.message; $('#new-term-error').hidden = false; }
  });
  document.querySelectorAll('[data-tab]').forEach(control => control.addEventListener('click', () => setPane(control.dataset.tab)));
  $('.editor-tabs').addEventListener('keydown', event => {
    const keys = ['color', 'terms', 'history']; if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); const next = (keys.indexOf(state.pane) + (event.key === 'ArrowRight' ? 1 : 2)) % keys.length; setPane(keys[next]); $('#tab-' + keys[next]).focus();
  });
  document.querySelectorAll('dialog').forEach(dialog => { dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close()); });
}
try {
  const response = await fetch('/studio-products.json', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Examples unavailable');
  const data = await response.json();
  if (data.prototype !== true || !Array.isArray(data.products) || data.products.length < 1 || data.products.length > 20) throw new Error('Invalid example catalogue');
  state.workspace = createReviewWorkspace(data.products); initialize(); selectProduct(data.products[0].id);
} catch { $('#studio-error').textContent = 'Skissen kunde inte starta. Ladda om sidan för att hämta produktexemplen.'; $('#studio-error').hidden = false; }
