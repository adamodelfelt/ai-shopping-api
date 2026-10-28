import { categoryOf, subcategoryOf, appearanceOf, colorOf, normalize } from '../taxonomy.js';
import { retailerHosts, imageHosts, safeUrl } from '../links.js';

export const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000) : '';
export function validateProduct(row) {
  if (!row || typeof row !== 'object' || !retailerHosts[row.retailer]) throw new Error('Invalid retailer');
  if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 300) throw new Error('Invalid product name');
  if (typeof row.price_sek !== 'number' || !Number.isFinite(row.price_sek) || row.price_sek < 0 || row.price_sek > 100_000 || row.currency !== 'SEK') throw new Error('Missing or invalid SEK price');
  if (typeof row.in_stock !== 'boolean' || !['kids', 'baby', 'teen'].includes(row.target_age_group)) throw new Error('Unverified child audience or stock');
  if (!row.category || row.category === 'other') throw new Error('Unclassified garment');
  const url = safeUrl(row.product_url, retailerHosts[row.retailer]);
  if (!url) throw new Error('Invalid retailer product link');
  const image = row.image_url ? safeUrl(row.image_url, [...imageHosts]) : null;
  if (row.image_url && !image) throw new Error('Invalid product image host');
  const result = {
    name: clean(row.name), category: row.category, subcategory: row.subcategory ?? row.category,
    brand: clean(row.brand), retailer: row.retailer, product_url: url, image_url: image,
    product_group_id: row.product_group_id ? clean(row.product_group_id) : null,
    price_sek: Math.round(row.price_sek * 100) / 100, in_stock: row.in_stock,
    target_age_group: row.target_age_group, target_gender: row.target_gender ?? 'unisex',
    color: colorOf(row.color) ?? clean(row.color), material: clean(row.material) || null,
    source_description: clean(row.source_description ?? row.description) || null, source_pattern: clean(row.source_pattern) || null,
    ...appearanceOf(`${row.name} ${row.source_description ?? row.description ?? ''} ${row.source_pattern ?? ''}`),
    classification: { version: 'whool-2', review_state: 'unreviewed', unknown_axes: ['absence_of_print', 'absence_of_pattern'] },
  };
  return result;
}
export function classifyName(name, context = '') {
  const category = categoryOf(name) ?? categoryOf(context);
  return { category, subcategory: subcategoryOf(name, category) ?? category };
}
export function adultName(name) { return /\b(?:adult|adults|vuxen|vuxna|woman|women|men|dam|herr)\b/.test(normalize(name)); }
