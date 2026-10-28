export const STUDIO_SCHEMA = 'whool-review-sketch/1';
export const COLOR_OPTIONS = [
  ['red', 'Röd'], ['burgundy', 'Vinröd'], ['orange', 'Orange'], ['brown', 'Brun'],
  ['pink', 'Rosa'], ['beige', 'Beige'], ['blue', 'Blå'], ['green', 'Grön'],
  ['white', 'Vit'], ['black', 'Svart'], ['grey', 'Grå'], ['yellow', 'Gul'],
  ['purple', 'Lila'], ['mixed', 'Flerfärgad'], ['unknown', 'Vet inte'],
];
export const PATTERN_OPTIONS = [['dotted', 'Prickigt'], ['striped', 'Randigt'], ['checked', 'Rutigt'], ['floral', 'Blommigt'], ['animal', 'Djurmönster'], ['printed', 'Figurtryck'], ['solid', 'Enfärgat']];
export const EVIDENCE_OPTIONS = [['dots', 'Prickar'], ['stripes', 'Ränder'], ['motif', 'Figurer / motiv'], ['slogan', 'Text / budskap'], ['shape', 'Form / detalj'], ['overall', 'Helhetsintryck']];
export const TERMS = [
  { id: 'rolig', name: 'Rolig', definition: 'Kan vara prickigt, randigt, ha tryck eller motiv. Bedöm plaggets uttryck, inte bara varumärket.' },
  { id: 'lekfull', name: 'Lekfull', definition: 'Ett lekfullt uttryck i mönster, detaljer, färgkombination eller form.' },
  { id: 'sot', name: 'Söt', definition: 'En subjektiv bedömning av ett mjukt eller gulligt uttryck. Ange vad du ser.' },
  { id: 'festlig', name: 'Festlig', definition: 'Passar ett festligt sammanhang genom till exempel material, form eller detaljer.' },
  { id: 'avskalad', name: 'Avskalad', definition: 'Ett lugnt uttryck med få visuella detaljer.' },
];
const copy = value => structuredClone(value);
const colorIds = new Set(COLOR_OPTIONS.map(item => item[0]));
const patternIds = new Set(PATTERN_OPTIONS.map(item => item[0]));
const evidenceIds = new Set(EVIDENCE_OPTIONS.map(item => item[0]));
const judgments = new Set(['unreviewed', 'yes', 'no', 'uncertain']);
const reasons = new Set(['', 'wrong_family', 'wrong_shade', 'pattern_color', 'wrong_variant', 'other']);
const cleanText = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(value);
export function initialReview(product, terms = TERMS) {
  return {
    color: { verdict: 'unreviewed', primary: colorIds.has(product.importedColorId) ? product.importedColorId : 'unknown', secondary: [], coverage: 'unknown', reason: '', note: '' },
    patternVerdict: 'unreviewed', patterns: [],
    terms: Object.fromEntries(terms.map(term => [term.id, { verdict: 'unreviewed', strength: 2, evidence: [], note: '' }])),
  };
}
export function validateReview(review, terms = TERMS) {
  const r = copy(review), c = r.color;
  if (!c || !['unreviewed', 'confirmed', 'flagged', 'corrected', 'uncertain'].includes(c.verdict) || !colorIds.has(c.primary)) throw new Error('Kontrollera färgbedömningen.');
  if (!Array.isArray(c.secondary) || c.secondary.length > 6 || new Set(c.secondary).size !== c.secondary.length || c.secondary.some(id => !colorIds.has(id) || ['unknown', 'mixed', c.primary].includes(id))) throw new Error('Välj olika mönsterfärger som skiljer sig från huvudfärgen.');
  if (!['unknown', 'solid', 'patterned', 'mixed'].includes(c.coverage) || !reasons.has(c.reason) || !cleanText(c.note, 600)) throw new Error('Kontrollera färgens underlag.');
  if (['confirmed', 'corrected'].includes(c.verdict) && c.primary === 'unknown') throw new Error('Välj en huvudfärg eller markera färgen som osäker.');
  if (['flagged', 'corrected'].includes(c.verdict) && !c.reason) throw new Error('Ange varför färgen är fel.');
  if (c.reason === 'other' && c.note.trim().length < 3) throw new Error('Beskriv färgfelet kort.');
  if (!['unreviewed', 'confirmed', 'uncertain'].includes(r.patternVerdict) || !Array.isArray(r.patterns) || r.patterns.length > 7 || new Set(r.patterns).size !== r.patterns.length || r.patterns.some(id => !patternIds.has(id))) throw new Error('Kontrollera mönsterkodningen.');
  if (r.patterns.includes('solid') && r.patterns.length > 1) throw new Error('Enfärgat kan inte kombineras med mönster.');
  if (r.patternVerdict === 'confirmed' && !r.patterns.length) throw new Error('Välj ett mönster, Enfärgat eller Osäker.');
  const known = new Set(terms.map(term => term.id));
  if (!r.terms || Object.keys(r.terms).some(id => !known.has(id))) throw new Error('Okänt begrepp.');
  for (const term of terms) {
    const value = r.terms[term.id];
    if (!value || !judgments.has(value.verdict) || !Number.isInteger(value.strength) || value.strength < 1 || value.strength > 3 || !Array.isArray(value.evidence) || value.evidence.length > 6 || new Set(value.evidence).size !== value.evidence.length || value.evidence.some(id => !evidenceIds.has(id)) || !cleanText(value.note, 600)) throw new Error('Kontrollera bedömningen för ' + term.name + '.');
    if (value.verdict === 'yes' && !value.evidence.length && value.note.trim().length < 3) throw new Error('Ange vad som stöder bedömningen för ' + term.name + '.');
  }
  if (c.verdict === 'unreviewed' && r.patternVerdict === 'unreviewed' && Object.values(r.terms).every(value => value.verdict === 'unreviewed')) throw new Error('Bedöm färg, mönster eller minst ett begrepp först.');
  return r;
}
export function effectiveColor(review, product) {
  return ['confirmed', 'corrected'].includes(review.color.verdict) ? review.color.primary : product.currentColorId;
}
export function colorLabel(id) { return COLOR_OPTIONS.find(item => item[0] === id)?.[1] ?? 'Ej bedömd'; }
export function createReviewWorkspace(products, { now = () => new Date().toISOString() } = {}) {
  const terms = copy(TERMS), records = new Map();
  for (const product of products) {
    if (!/^\d{1,18}$/.test(product.id) || records.has(product.id)) throw new Error('Ogiltigt produktexempel.');
    records.set(product.id, { product: copy(product), draft: initialReview(product, terms), revisions: [], history: [] });
  }
  const get = id => { const record = records.get(id); if (!record) throw new Error('Produkten saknas.'); return record; };
  const withUnknownTerms = review => {
    const result = copy(review);
    for (const term of terms) result.terms[term.id] ??= { verdict: 'unreviewed', strength: 2, evidence: [], note: '' };
    return result;
  };
  const status = record => {
    const latest = record.revisions.at(-1), baseline = latest?.review ?? initialReview(record.product, terms);
    if (JSON.stringify(record.draft) !== JSON.stringify(withUnknownTerms(baseline))) return 'draft';
    return latest?.status ?? (record.product.flags?.length ? 'flagged' : 'unreviewed');
  };
  return {
    terms: () => copy(terms),
    record(id) { const record = get(id); return { ...copy(record), status: status(record) }; },
    list() { return [...records.values()].map(record => ({ product: copy(record.product), status: status(record) })); },
    update(id, review) { get(id).draft = copy(review); },
    reset(id) { const record = get(id); record.draft = withUnknownTerms(record.revisions.at(-1)?.review ?? initialReview(record.product, terms)); },
    addTerm(name, definition) {
      name = String(name).trim(); definition = String(definition).trim();
      if (!cleanText(name, 32) || name.length < 2 || !cleanText(definition, 240) || definition.length < 8 || terms.length >= 12) throw new Error('Ange ett namn och en kort gemensam definition. Högst 12 begrepp.');
      const id = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!id || terms.some(term => term.id === id)) throw new Error('Begreppet finns redan eller har ett ogiltigt namn.');
      terms.push({ id, name, definition });
      for (const record of records.values()) record.draft.terms[id] = { verdict: 'unreviewed', strength: 2, evidence: [], note: '' };
      return id;
    },
    save(id, role = 'coder') {
      if (!['coder', 'reviewer'].includes(role)) throw new Error('Välj en testroll.');
      const record = get(id), review = validateReview(record.draft, terms);
      const revision = { revision: record.revisions.length + 1, createdAt: now(), author: role, status: 'pending', review, definitions: copy(terms) };
      record.revisions.push(copy(revision));
      record.history.push({ action: 'proposed', revision: revision.revision, at: revision.createdAt, role });
      return copy(revision);
    },
    approve(id, role) {
      if (role !== 'reviewer') throw new Error('Byt till testrollen Granskare för att godkänna.');
      const record = get(id), latest = record.revisions.at(-1);
      if (!latest || latest.status !== 'pending' || JSON.stringify(record.draft) !== JSON.stringify(withUnknownTerms(latest.review))) throw new Error('Spara det aktuella förslaget före godkännande.');
      latest.status = 'approved'; latest.reviewedAt = now();
      record.history.push({ action: 'approved', revision: latest.revision, at: latest.reviewedAt, role });
    },
    returnForChanges(id, role) {
      if (role !== 'reviewer') throw new Error('Endast testrollen Granskare kan skicka tillbaka.');
      const record = get(id), latest = record.revisions.at(-1);
      if (!latest || latest.status !== 'pending') throw new Error('Det finns inget väntande förslag.');
      latest.status = 'changes_requested';
      record.history.push({ action: 'returned', revision: latest.revision, at: now(), role });
    },
    export() {
      return {
        schema: STUDIO_SCHEMA, prototype: true, applied: false, exportedAt: now(),
        proposals: [...records.values()].filter(record => record.revisions.length).map(record => ({
          productId: record.product.id, name: record.product.name, sourceUrl: record.product.url,
          sourceCatalogueDate: record.product.catalogueDate, importedColor: record.product.importedColor,
          previousWhoolColor: record.product.currentColorId, revisions: copy(record.revisions), history: copy(record.history),
        })),
      };
    },
  };
}
