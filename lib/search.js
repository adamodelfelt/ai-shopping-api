import { normalize, contains, categoryOf, colorOf, subcategoryOf, appearanceOf, garmentPatterns } from './taxonomy.js';
import { publicProduct, storeSlug } from './links.js';

export function splitQuery(query) {
  const fragments = query.split(/\s+(?:och|and|plus)\s+|\s*[,;+]\s*/i).map(part => part.trim()).filter(Boolean);
  const groups = [];
  for (const fragment of fragments) {
    // Preserve compound attributes: "tröja med tryck och ränder" is one intent.
    if (groups.length && !categoryOf(fragment) && !colorOf(fragment)) groups[groups.length - 1] += ` och ${fragment}`;
    else groups.push(fragment);
  }
  return groups;
}
export function parseIntent(query, profiles = []) {
  const category = categoryOf(query);
  const styleReference = /\b(?:som|like|inspirerad|inspired)\b/.test(normalize(query));
  const named = profiles.filter(brand => [brand.slug, brand.display_name, ...(brand.aliases ?? [])].some(alias => contains(query, alias))).map(brand => brand.slug);
  const preferences = profiles.flatMap(brand => (brand.descriptor_mappings ?? []).filter(mapping => mapping.status === 'approved' && mapping.reviewed_by && Number.isFinite(Date.parse(mapping.reviewed_at)) && [mapping.term, ...(mapping.aliases ?? [])].some(term => contains(query, term))).map(mapping => ({ slug: brand.slug, term: mapping.term, weight: Math.min(3, Math.max(0, Number(mapping.weight) || 1)) })));
  const appearance = appearanceOf(query);
  const unsupportedAbsence = /\b(?:utan|without|no)\b/.test(normalize(query)) && /\b(?:tryck|print|prints|monster|patterns|rand|stripes)\b/.test(normalize(query));
  const adult = /\b(?:adult|adults|vuxen|vuxna|dam|herr|women|men)\b/.test(normalize(query));
  return {
    category, subcategory: subcategoryOf(query, category), color: colorOf(query), ...appearance,
    any_pattern: ['monster', 'monstrad', 'monstrade', 'pattern', 'patterns', 'patterned'].some(word => contains(query, word)),
    age: contains(query, 'baby') || contains(query, 'bebis') ? 'baby' : contains(query, 'teen') || contains(query, 'tonaring') ? 'teen' : null,
    brand_slugs: styleReference ? [] : named, style_reference_slugs: styleReference ? named : [], brand_preferences: preferences,
    organic: ['organic', 'ekologisk', 'ekologiska'].some(word => contains(query, word)),
    unsupported_absence: unsupportedAbsence, unsupported_audience: adult,
  };
}
export function supported(intent) {
  return Boolean(intent.category || intent.color || intent.brand_slugs.length || intent.style_reference_slugs.length || intent.brand_preferences.length || intent.any_pattern || ['print_tags', 'pattern_tags', 'motif_tags', 'decoration_tags'].some(axis => intent[axis].length));
}
export function eligible(row) {
  return row.is_visible === true && row.in_stock === true && ['kids', 'baby', 'teen'].includes(row.target_age_group) && Number.isFinite(Number(row.price_sek)) && Number(row.price_sek) >= 0;
}
export function matchesIntent(row, intent, { relaxSubcategory = false, extend = false } = {}) {
  if (!eligible(row) || intent.unsupported_absence || intent.unsupported_audience) return false;
  if (intent.age && row.target_age_group !== intent.age) return false;
  if (intent.category && row.category !== intent.category) return false;
  if (intent.category === 'fleece' && ['pants', 'overall', 'accessories', 'socks'].includes(categoryOf(row.name))) return false;
  if (intent.subcategory && !relaxSubcategory && row.subcategory !== intent.subcategory) return false;
  if (intent.color && colorOf(row.color) !== intent.color && !(extend && nearbyColors[intent.color]?.includes(colorOf(row.color)))) return false;
  if (intent.brand_slugs.length && !intent.brand_slugs.includes(storeSlug(row.retailer))) return false;
  for (const axis of ['print_tags', 'pattern_tags', 'motif_tags', 'decoration_tags']) if (!intent[axis].every(tag => (axis === 'pattern_tags' ? garmentPatterns(row) : row[axis] ?? []).includes(tag))) return false;
  if (intent.any_pattern && !garmentPatterns(row).length) return false;
  return true;
}
const nearbyColors = { blue: ['grey'], black: ['grey'], grey: ['black', 'blue'], beige: ['brown', 'white'], brown: ['beige'], green: ['blue'], pink: ['purple'], red: ['orange'], yellow: ['orange'], purple: ['pink'], white: ['beige'], orange: ['red', 'yellow'] };
export function rankRows(rows, intent, query, profiles) {
  const referencePreferences = profiles.filter(brand => intent.style_reference_slugs.includes(brand.slug)).flatMap(brand => (brand.descriptor_mappings ?? []).filter(m => m.status === 'approved' && m.reviewed_by && Number.isFinite(Date.parse(m.reviewed_at))).map(m => normalize(m.term)));
  return rows.map(row => {
    const slug = storeSlug(row.retailer);
    const brand = profiles.find(profile => profile.slug === slug);
    const approved = (brand?.descriptor_mappings ?? []).filter(m => m.status === 'approved' && m.reviewed_by && Number.isFinite(Date.parse(m.reviewed_at)));
    const affinity = approved.filter(m => referencePreferences.includes(normalize(m.term))).length;
    const preference = intent.brand_preferences.filter(p => p.slug === slug).reduce((sum, p) => sum + p.weight, 0);
    const nameMatches = normalize(query).split(' ').filter(word => word.length > 2 && contains(row.name, word)).length;
    return { ...row, _rank: nameMatches + preference * 5 + affinity * 3 + (intent.organic && row.eco ? 3 : 0), _affinity: affinity };
  }).filter(row => !intent.style_reference_slugs.length || row._affinity > 0).sort((a, b) => b._rank - a._rank || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
}
export function diverse(rows, limit = 8) {
  const groups = new Map(), variants = new Set();
  for (const row of rows) {
    const identity = `${storeSlug(row.retailer)}:${row.product_group_id || row.product_url || row.id}:${colorOf(row.color) ?? normalize(row.color)}`;
    if (variants.has(identity)) continue;
    variants.add(identity);
    const brand = storeSlug(row.retailer);
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand).push(row);
  }
  const results = [];
  while (results.length < limit) {
    let added = false;
    for (const list of groups.values()) if (list.length && results.length < limit) { results.push(list.shift()); added = true; }
    if (!added) break;
  }
  return results;
}
export function searchCatalogue(rows, query, profiles = [], options = {}) {
  const candidateLimit = options.candidateLimit ?? 8;
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 48) throw new Error('Invalid candidate limit');
  const excluded = new Set(options.excludeProductIds ?? []);
  return splitQuery(query).map(part => {
    const intent = parseIntent(part, profiles);
    const available = rows.filter(row => !excluded.has(String(row.id)));
    let selected = supported(intent) ? available.filter(row => matchesIntent(row, intent, { extend: options.extendSearch })) : [];
    let relaxed = false;
    if (!selected.length && intent.subcategory) { selected = available.filter(row => matchesIntent(row, intent, { relaxSubcategory: true, extend: options.extendSearch })); relaxed = true; }
    const products = diverse(rankRows(selected, intent, part, profiles), candidateLimit).map(row => ({ ...publicProduct(row), matchReasons: [row.category, intent.color ? row.color : null].filter(Boolean) }));
    return {
      category: part, sourceQuery: part, filters: { category: intent.category, color: intent.color, subcategory: intent.subcategory }, products,
      notice: intent.unsupported_absence ? 'Frånvaro av tryck eller mönster är inte verifierad i katalogen.' : intent.unsupported_audience ? 'Den aktuella katalogen innehåller barn- och babykläder.' : !supported(intent) ? 'Prova en plaggtyp, färg, ett märke eller ett mönster.' : relaxed ? 'Visar samma plaggtyp med en bredare underkategori.' : options.extendSearch ? 'Utökad sökning: närliggande färger kan visas. Övriga filter behålls.' : '',
    };
  });
}
export function similarProducts(rows, id) {
  const reference = rows.find(row => String(row.id) === id && eligible(row));
  if (!reference) return null;
  const scored = rows.filter(row => eligible(row) && String(row.id) !== id && (!reference.product_group_id || row.product_group_id !== reference.product_group_id) && row.category === reference.category && row.target_age_group === reference.target_age_group).map(row => {
    const reasons = [];
    let score = 1;
    if (colorOf(row.color) && colorOf(row.color) === colorOf(reference.color)) { score += 3; reasons.push('Samma färg'); }
    if (row.subcategory && row.subcategory === reference.subcategory) { score += 2; reasons.push('Samma underkategori'); }
    for (const axis of ['print_tags', 'pattern_tags', 'motif_tags', 'decoration_tags']) {
      const values = axis === 'pattern_tags' ? garmentPatterns(row) : row[axis] ?? [];
      const referenceValues = axis === 'pattern_tags' ? garmentPatterns(reference) : reference[axis] ?? [];
      if (values.some(tag => referenceValues.includes(tag))) { score += 3; reasons.push('Liknande produktbeskrivning'); }
    }
    const cross = storeSlug(row.retailer) !== storeSlug(reference.retailer);
    return { ...row, _rank: score, _cross: cross, _reasons: reasons };
  }).filter(row => row._rank >= 3).sort((a, b) => b._rank - a._rank || Number(b._cross) - Number(a._cross));
  return { reference: { id: String(reference.id), name: reference.name, brand: reference.brand }, method: 'retailer_text_attributes', imageAnalysis: false, products: diverse(scored).map(row => ({ ...publicProduct(row), similarity: { score: row._rank, reasons: row._reasons, cross_brand: row._cross } })) };
}
