import guides from '../config/size-guides.json' with { type: 'json' };
import productEvidence from '../config/product-sizing.json' with { type: 'json' };
import { fitEvidence } from './fit-evidence.js';

const apparel = new Set(['pants', 'jacket', 'sweater', 't-shirt', 'body', 'overall', 'dress', 'skirt', 'fleece', 'shirt', 'underwear', 'swimwear', 'pyjamas', 'set']);
export function canonicalSize(value) {
  const m = String(value ?? '').trim().match(/^(\d{2,3})(?:\s*[/-]\s*(\d{2,3}))?$/);
  return m ? m[1] + (m[2] ? `/${m[2]}` : '') : '';
}
const numbers = value => canonicalSize(value).split('/').map(Number).filter(Boolean);
const overlaps = (a, b) => a?.length && b?.length && Math.max(Math.min(...a), Math.min(...b)) <= Math.min(Math.max(...a), Math.max(...b));
const ageWords = { ett: 1, en: 1, tva: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, atta: 8, nio: 9, tio: 10, elva: 11, tolv: 12, tretton: 13, fjorton: 14, femton: 15, sexton: 16 };
export function parseSizingIntent(query) {
  const text = String(query).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[‐‑–—]/g, '-'), age = text.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*-?\s*(?:ari(?:ng|g)\w*|ar(?:s)?\b|years?\b)/);
  const word = text.match(new RegExp(`\\b(${Object.keys(ageWords).join('|')})\\s*-?ari(?:ng|g)\\w*\\b`));
  const years = age ? Number(age[1].replace(',', '.')) : word ? ageWords[word[1]] : null;
  const metric = aliases => { const m = text.match(new RegExp(`\\b(?:${aliases})\\s*(?:pa |ar |: ?)?(\\d{2,3}(?:[.,]\\d+)?)\\s*cm\\b`)); return m ? Number(m[1].replace(',', '.')) : null; };
  let height = metric('langd|kroppslangd|height');
  const tall = text.match(/\b(\d{2,3}(?:[.,]\d+)?)\s*cm\s*(?:lang\w*|tall)\b/);
  if (tall) height = Number(tall[1].replace(',', '.'));
  const waist = metric('midja|midjematt|waist'), hip = metric('stuss|hoft|hoftmatt|hip'), inseam = metric('innerben|innerbenslangd|inseam');
  const explicit = text.match(/\b(?:storlek|stl|size)\s*(\d{2,3}(?:\s*[/-]\s*\d{2,3})?)\b/);
  const bare = [...text.matchAll(/\b(\d{2,3}(?:\s*[/-]\s*\d{2,3})?)\b/g)].find(m => !/^\s*-?\s*(?:cm\b|ar\b|ari(?:ng|g)|years?\b)/.test(text.slice(m.index + m[0].length)));
  const size = canonicalSize(explicit?.[1] ?? (height === null && waist === null && hip === null && inseam === null ? bare?.[1] : '')) || null;
  return { ageMonths: years !== null ? years * 12 : null, height, waist, hip, inseam, size, slim: /\b(?:smal\w*|slank\w*|slender|slim)\b/.test(text) };
}
export function hasSizingIntent(i) { return Boolean(i && (i.ageMonths !== null || i.height !== null || i.waist !== null || i.hip !== null || i.inseam !== null || i.size || i.slim)); }
function localFit(row) {
  return fitEvidence(`${row.name ?? ''} ${row.source_description ?? ''}`);
}
function preferProductBody(fallback, specific = []) {
  const replaced = new Set(specific.flatMap(chart => chart.rows.map(row => row.label)));
  return [...specific, ...fallback.map(chart => ({ ...chart, rows: chart.rows.filter(row => !replaced.has(row.label)) })).filter(chart => chart.rows.length)];
}
export function sizingForRow(row) {
  const guide = guides.brands.find(brand => brand.store === row.retailer);
  if (!guide) return null;
  const record = productEvidence.products[row.product_url], fit = record?.fit ?? localFit(row);
  if (!apparel.has(row.category) && !record?.charts?.length) return null;
  return {
    guideUrl: guide.sourceUrl, checkedAt: guide.checkedAt,
    bodyCharts: apparel.has(row.category) ? preferProductBody(guide.charts.filter(c => !c.ageGroup || c.ageGroup === row.target_age_group || row.target_age_group === 'teen' && c.ageGroup === 'kids'), record?.linkedBodyCharts) : [],
    productCharts: record?.charts ?? [], productLabels: record?.labels ?? [],
    fit: { adjustableWaist: fit.adjustableWaist === true, slim: fit.slim === true, sourceUrl: record?.sourceUrl ?? row.product_url },
    productStatus: record?.status ?? 'not_checked', productCheckedAt: record?.checkedAt ?? null,
  };
}
export function withLiveSizing(product, record) {
  if (!record || record.sourceUrl !== product.url || !product.sizing && !record.charts?.length) return product;
  const base = product.sizing ?? { guideUrl: guides.brands.find(guide => guide.store === product.store)?.sourceUrl ?? product.url, checkedAt: record.checkedAt, bodyCharts: [] };
  return { ...product, sizing: { ...base, bodyCharts: preferProductBody(base.bodyCharts, record.linkedBodyCharts), productCharts: record.charts, productLabels: record.labels, fit: { adjustableWaist: record.fit.adjustableWaist, slim: record.fit.slim, sourceUrl: record.sourceUrl }, productStatus: record.status, productCheckedAt: record.checkedAt } };
}
export function bodyRows(sizing, label) {
  const exact = canonicalSize(label);
  if (!exact) return [];
  return (sizing?.bodyCharts ?? []).flatMap(chart => {
    const direct = chart.rows.filter(row => canonicalSize(row.label) === exact);
    return (direct.length ? direct : numbers(exact).length === 2 ? chart.rows.filter(row => numbers(exact).includes(Number(row.label))) : []).map(row => ({ ...row, chartId: chart.id, audience: chart.audience }));
  });
}
function guideSelection(sizing, intent) {
  const all = (sizing?.bodyCharts ?? []).flatMap(c => c.rows);
  if (intent.height !== null) {
    const distance = row => Math.max(Math.min(...row.height) - intent.height, 0, intent.height - Math.max(...row.height));
    const min = Math.min(...all.filter(row => row.height).map(distance));
    // Do not suggest a nearest size outside the guide's published height range.
    const heights = all.flatMap(row => row.height ?? []);
    if (!heights.length || intent.height < Math.min(...heights) || intent.height > Math.max(...heights)) return [];
    return all.filter(row => row.height && distance(row) === min);
  }
  if (intent.ageMonths === null) return intent.size ? all.filter(row => overlaps(numbers(row.label), numbers(intent.size))) : all;
  return all.filter(row => row.ageMonths && (row.ageMonths[0] === row.ageMonths[1] ? row.ageMonths[0] === intent.ageMonths : intent.ageMonths > row.ageMonths[0] && intent.ageMonths <= row.ageMonths[1] || intent.ageMonths === 0 && row.ageMonths[0] === 0));
}
export function variantFits(product, label, intent) {
  if (!hasSizingIntent(intent)) return true;
  if (intent.size && !overlaps(numbers(label), numbers(intent.size))) return false;
  const measuredWaist = (product.sizing?.productCharts ?? []).filter(chart => chart.basis === 'garment').some(chart => chart.rows.some(row => canonicalSize(row.label) === canonicalSize(label) && [row.measurements.waistRelaxedFlat, row.measurements.waistFlat].some(Number.isFinite)));
  if (intent.slim && !product.sizing?.fit?.adjustableWaist && !product.sizing?.fit?.slim && !measuredWaist) return false;
  if ((intent.height !== null || intent.ageMonths !== null) && !guideSelection(product.sizing, intent).some(row => overlaps(numbers(row.label), numbers(label)))) return false;
  return true;
}
export function sizingPriority(sizing, intent) {
  if (!hasSizingIntent(intent)) return 0;
  let score = intent.slim ? (sizing?.fit?.adjustableWaist ? 6 : 0) + (sizing?.fit?.slim ? 2 : 0) : 0;
  const selected = guideSelection(sizing, intent);
  if ((intent.height !== null || intent.ageMonths !== null) && sizing?.productLabels?.some(label => selected.some(row => overlaps(numbers(row.label), numbers(label))))) score += 3;
  for (const key of ['waist', 'hip', 'inseam']) if (intent[key] !== null) {
    const values = selected.flatMap(row => [row.measurements[key]].flat()).filter(Number.isFinite);
    if (values.length) score += Math.max(0, 3 - Math.min(...values.map(value => Math.abs(value - intent[key]))));
  }
  if (intent.slim) {
    // Compare like-for-like garment half widths only, at the requested length/age.
    // This affects ordering, never establishes a body fit or adds a missing measurement.
    const waistWidths = (sizing?.productCharts ?? []).filter(c => c.basis === 'garment').flatMap(c => c.rows).filter(row => selected.some(target => overlaps(numbers(row.label), numbers(target.label)))).map(row => row.measurements.waistRelaxedFlat ?? row.measurements.waistFlat).filter(Number.isFinite);
    if (waistWidths.length) score += Math.max(0, (60 - Math.min(...waistWidths)) / 10);
  }
  return score;
}
export function addSizeRecommendation(product, intent, sizes) {
  if (!hasSizingIntent(intent)) return product;
  const matches = sizes.filter(size => variantFits(product, size.label, intent)), reasons = [];
  if (intent.slim && product.sizing?.fit?.adjustableWaist) reasons.push('Justerbar midja enligt produktbeskrivningen');
  if (intent.slim && product.sizing?.fit?.slim) reasons.push('Smal passform enligt produktbeskrivningen; midjevidden behöver kontrolleras');
  if (intent.slim && (product.sizing?.productCharts ?? []).some(chart => chart.rows.some(row => matches.some(size => canonicalSize(size.label) === canonicalSize(row.label)) && [row.measurements.waistRelaxedFlat, row.measurements.waistFlat].some(Number.isFinite)))) reasons.push('Produktens egen midjevidd finns att jämföra med ett plagg som sitter bra');
  const rows = matches.map(size => ({ label: size.label, body: bodyRows(product.sizing, size.label), garment: (product.sizing?.productCharts ?? []).flatMap(chart => chart.rows.filter(row => canonicalSize(row.label) === canonicalSize(size.label)).map(row => ({ ...row, sourceUrl: chart.sourceUrl, checkedAt: chart.checkedAt }))) }));
  return { ...product, sizeRecommendation: { labels: matches.map(size => size.label), requested: intent, reasons, rows, notice: intent.height === null && intent.ageMonths !== null ? 'Åldern ger ett ungefärligt storleksförslag. Kontrollera barnets längd och midja.' : 'Jämför kroppsmått med kroppstabellen och plaggmått med ett plagg som sitter bra.' } };
}
