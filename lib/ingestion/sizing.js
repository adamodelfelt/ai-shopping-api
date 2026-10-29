import { assignedJson, scriptJson, unpackNuxt } from './parsers.js';
import { safeUrl, retailerHosts } from '../links.js';
import { normalize } from '../taxonomy.js';
import { fitEvidence, cleanSizingText } from '../fit-evidence.js';
export { fitEvidence } from '../fit-evidence.js';

export function plain(value) {
  return cleanSizingText(value);
}
export function htmlTables(html) {
  return [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(table => [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => plain(cell[1]))));
}
export function richText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(richText).join(' ');
  return value && typeof value === 'object' ? richText(value.children ?? value.html ?? []) : '';
}
export function richTables(value) {
  const tables = [];
  const visit = item => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!item || typeof item !== 'object') return;
    if (item.tag === 'table') {
      const rows = [];
      const collect = node => {
        if (Array.isArray(node)) { node.forEach(collect); return; }
        if (!node || typeof node !== 'object') return;
        if (node.tag === 'tr') rows.push((node.children ?? []).filter(c => c?.tag === 'td' || c?.tag === 'th').map(cell => plain(richText(cell))));
        else collect(node.children);
      };
      collect(item.children); tables.push(rows);
    } else visit(item.children ?? item.html);
  };
  visit(value); return tables;
}
export function linkedBodyTable(table, sourceUrl, checkedAt) {
  const headers = table[0]?.map(normalize) ?? [];
  const index = pattern => headers.findIndex(h => pattern.test(h));
  const size = index(/^storlek(?:ar)?$|^langd\b/), ageIndex = index(/^(?:ar|alder|manader)$/);
  if (size < 0 || ageIndex < 0) return null;
  const dimensions = [['chest', index(/brost/)], ['waist', index(/midj/)], ['hip', index(/stuss|hoft/)], ['inseam', index(/(?:inner)?benlangd|innerben/)]];
  const rows = table.slice(1).flatMap(cells => {
    if (!/^\d{2,3}$/.test(cells[size] ?? '')) return [];
    const age = cells[ageIndex].match(/\d+(?:[.,]\d+)?/g)?.map(value => Number(value.replace(',', '.')));
    if (!age?.length) return [];
    const factor = headers[ageIndex] === 'manader' || /m\b|mån|man|month/i.test(cells[ageIndex]) ? 1 : 12;
    if (factor === 1 && age.length === 2 && age[1] < age[0]) age[1] *= 12;
    const measurements = Object.fromEntries(dimensions.filter(([,i]) => i >= 0).map(([key,i]) => [key,numeric(cells[i])]).filter(([,value]) => value !== null && value > 0 && value < 180));
    return [{ label: cells[size], height: [+cells[size],+cells[size]], ageMonths: [age[0]*factor,(age[1]??age[0])*factor], measurements }];
  });
  return rows.length ? { id: 'product-linked-body-guide', basis: 'body', unit: 'cm', audience: 'unisex', sourceUrl, checkedAt, rows } : null;
}
const numeric = value => /^\d+(?:[.,]\d+)?(?:\s*cm)?$/.test(plain(value)) ? Number(plain(value).replace(/\s*cm$/, '').replace(',', '.')) : null;
const dimensions = header => {
  const h = String(header).replace(/½/g, '1/2').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  if (/waist relaxed/.test(h)) return 'waistRelaxedFlat';
  if (/waist stretched/.test(h)) return 'waistStretchedFlat';
  if (/waist/.test(h) && /1\/2|half/.test(h)) return 'waistFlat';
  if (/chest/.test(h) && /1\/2|half/.test(h)) return 'chestFlat';
  if (/seat|hip/.test(h) && /1\/2|half/.test(h)) return 'hipFlat';
  if (/bottom/.test(h) && /1\/2|half/.test(h)) return 'hemFlat';
  if (/center back length/.test(h)) return 'backLength';
  if (/sleeve length/.test(h)) return 'sleeveLength';
  if (/inseam|inside leg|innerben/.test(h)) return 'inseam';
  if (/outseam/.test(h)) return 'outseam';
  return null;
};
export function garmentTable(table, { sourceUrl, checkedAt, waistFlatConfirmed = false } = {}) {
  if (!table?.length || !/^(?:size|storlek)$/i.test(table[0]?.[0])) return null;
  const headers = table[0], rows = [], issues = [];
  for (const cells of table.slice(1)) {
    const label = cells[0]?.replace(/\s*-\s*/g, '/');
    if (!/^\d{2,3}(?:\/\d{2,3})?$/.test(label)) continue;
    const measurements = {};
    for (let index = 1; index < headers.length; index++) {
      const key = dimensions(headers[index]);
      if (!key) continue;
      const value = numeric(cells[index]);
      const max = key.endsWith('Flat') ? 100 : 180;
      if (value === null || value <= 0 || value > max) { issues.push({ size: label, column: headers[index], raw: cells[index] ?? '', reason: 'invalid_measurement' }); continue; }
      if (key.startsWith('waist') && key.endsWith('Flat') && !/½|1\/2|half/i.test(headers[index]) && !waistFlatConfirmed) { issues.push({ size: label, column: headers[index], raw: cells[index], reason: 'ambiguous_measurement_basis' }); continue; }
      measurements[key] = value;
    }
    if (Object.keys(measurements).length) rows.push({ label, measurements });
  }
  return rows.length ? { basis: 'garment', unit: 'cm', sourceUrl, checkedAt, rows, issues } : null;
}
export function textGarmentMeasurements(text, labels, sourceUrl, checkedAt) {
  const rows = new Map(), source = plain(text);
  // A model's height or a sample's size must never become a garment measurement.
  const pattern = /(?:innerbens(?:mått|längd)|inseam|inside leg(?: length)?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*cm\s*(?:(?:i|för|på|in|for)\s*(?:storlek|size)\s*(\d{2,3}(?:\s*[/-]\s*\d{2,3})?)|(?:på|för|in|for)\s*(?:alla storlekar|all sizes))/gi;
  for (const m of source.matchAll(pattern)) {
    const value = Number(m[1].replace(',', '.')); if (value <= 0 || value > 180) continue;
    for (const label of m[2] ? [m[2].replace(/\s*[/-]\s*/g, '/')] : labels) if (labels.includes(label)) rows.set(label, { label, measurements: { inseam: value } });
  }
  return rows.size ? { basis: 'garment', unit: 'cm', sourceUrl, checkedAt, rows: [...rows.values()], issues: [], method: 'explicit_size_in_product_text' } : null;
}
export function structuredProductMeasurements(input, labels, sourceUrl, checkedAt) {
  // An unqualified product-level measurement cannot be copied across multiple sizes.
  if (!input || labels.length !== 1 || !Object.keys(input).length || Object.keys(input).some(key => !['length','width'].includes(key))) return null;
  const measurements = {};
  for (const [key, raw] of Object.entries(input)) {
    if (typeof raw !== 'string' || !/^\d+(?:[.,]\d+)?\s*cm$/.test(raw)) return null;
    const value = numeric(raw); if (value <= 0 || value > 300) return null;
    measurements[key] = value;
  }
  return { basis: 'garment', unit: 'cm', sourceUrl, checkedAt, rows: [{label:labels[0], measurements}], issues: [], method: 'retailer_product_measurements_single_size' };
}
function find(root, predicate, seen = new Set()) {
  if (!root || typeof root !== 'object' || seen.has(root)) return null;
  seen.add(root);
  if (predicate(root)) return root;
  for (const value of Object.values(root)) { const found = find(value, predicate, seen); if (found) return found; }
  return null;
}
export function parseProductSizing(store, html, address, checkedAt = new Date().toISOString()) {
  const sourceUrl = safeUrl(address, retailerHosts[store] ?? []);
  if (!sourceUrl) throw new Error('Invalid sizing source');
  let product, identity, text = '', tables = [], labels = [], waistFlatConfirmed = false, linkedBodyCharts = [];
  if (store === 'tretorn') {
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*("(?:\\.|[^"\\])*")/);
    if (!match) throw new Error('Missing sizing product state');
    product = JSON.parse(JSON.parse(match[1])).page?.data;
    if (!product?.sku || !new URL(sourceUrl).pathname.endsWith(`-${product.sku}`)) throw new Error('Sizing product identity changed');
    text = [product.name, product.description, product.customAttributes?.attrDetails, product.customAttributes?.attrFit?.title].join(' ');
    tables = htmlTables(product.customAttributes?.attrSizeguideLegacy ?? '');
    // This exact diagram was visually checked: waist and hip are half widths.
    waistFlatConfirmed = product.customAttributes?.attrSizeguideImageUrl === 'https://a.storyblok.com/f/339771/4168x6251/ee9cc2e913/figur_260203_kids_lowerbody.jpg';
    labels = (product.variations ?? []).map(item => item.name);
  } else if (store === 'minirodini') {
    const response = assignedJson(html, '__remixContext').state?.loaderData?.['gears-route-wildcard']?.pageResponse;
    product = response?.page?.productData;
    identity = response?.page?.meta?.canonicalUrl;
    text = [product?.name, product?.description, product?.mp_size_guide_text].join(' ');
    // Only the current product's description; global guides and recommendations are excluded.
    tables = htmlTables(product?.description ?? '');
    labels = (product?.frontendItems ?? []).map(item => item.name);
  } else if (store === 'newbie' || store === 'pop') {
    product = assignedJson(html, 'CURRENT_PAGE', { undefinedAsNull: true });
    identity = product.canonicalUrl || product.url;
    text = [product.displayName, product.description, product.metaDescription, product.usp, ...(product.features ?? []).filter(item => typeof item === 'string')].join(' ');
    tables = htmlTables(product.description ?? '');
    labels = store === 'newbie' ? (product.variations ?? []).map(item => item.displayName) : (product.sizes ?? []).map(item => item.sizeName);
    const guide = store === 'pop' ? product.sizeInformation?.sizeGuide?.mainBody : product.sizeGuide?.recommendationText;
    if (store === 'pop' || /kroppsmått/i.test(richText(guide))) linkedBodyCharts = richTables(guide).map(table => linkedBodyTable(table, sourceUrl, checkedAt)).filter(Boolean);
  } else if (store === 'lindex') {
    const match = new URL(address).pathname.match(/\/p\/(\d+)-(\d+)-/);
    const root = unpackNuxt(scriptJson(html, '__NUXT_DATA__'));
    product = match && find(root.data, value => String(value.styleId) === match[1] && String(value.colorId) === match[2] && Array.isArray(value.sizes));
    if (!product) throw new Error('Sizing product identity changed');
    text = [product.name, product.description, product.descriptionText, ...(product.bullets ?? product.bulletPoints ?? []).filter(item => typeof item === 'string')].join(' ');
    tables = htmlTables(product.description ?? ''); labels = product.sizes.map(item => item.sizeName);
  } else {
    throw new Error('Product sizing parser not verified for retailer');
  }
  if (identity) {
    const actual = new URL(identity, address), requested = new URL(address);
    const samePath = actual.pathname.replace(/\/$/, '') === requested.pathname.replace(/\/$/, '');
    // Category paths and translated slugs can change; retailer article/color identity cannot.
    const sameArticle = store === 'newbie' ? /^\d+$/.test(String(product.code)) && requested.pathname.split('/').filter(Boolean).at(-1) === String(product.code) : store === 'pop' && /\d{8}-\d+$/.test(requested.pathname) && actual.pathname.match(/\d{8}-\d+$/)?.[0] === requested.pathname.match(/\d{8}-\d+$/)?.[0];
    if (!safeUrl(actual.href, retailerHosts[store]) || !samePath && !sameArticle) throw new Error('Sizing product identity changed');
  }
  if (!product || !labels.length) throw new Error('Product sizing missing');
  const normalizedLabels = [...new Set(labels.map(label => String(label).replace(/\s*-\s*/g, '/')))];
  const garmentContext = store === 'tretorn' || /plaggmått|plaggets mått|garment measurements|product measurements/i.test(text);
  const charts = garmentContext ? tables.map(table => garmentTable(table, { sourceUrl, checkedAt, waistFlatConfirmed })).filter(Boolean) : [];
  const textualChart = textGarmentMeasurements(text, normalizedLabels, sourceUrl, checkedAt);
  if (textualChart) charts.push(textualChart);
  const structured = store === 'lindex' ? structuredProductMeasurements(product.measurements, normalizedLabels, sourceUrl, checkedAt) : null;
  if (structured) charts.push(structured);
  const unparsedMeasurements = !structured && product.measurements && Object.keys(product.measurements).length ? product.measurements : product.measurementChart?.length ? product.measurementChart : undefined;
  return { parserVersion: 5, sourceUrl, checkedAt, status: charts.length ? 'product_measurements' : unparsedMeasurements || tables.length ? 'measurements_need_review' : 'no_product_table_found', labels: normalizedLabels, fit: fitEvidence(text), charts, ...(linkedBodyCharts.length ? { linkedBodyCharts } : {}), ...(tables.length ? { sourceTables: tables, waistFlatConfirmed } : {}), ...(unparsedMeasurements ? { unparsedMeasurements } : {}) };
}
