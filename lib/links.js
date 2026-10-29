import { garmentPatterns, productColor, colorTone } from './taxonomy.js';
import { sizingForRow } from './sizing.js';

export const retailerHosts = {
  arket: ['www.arket.com', 'arket.com'], minirodini: ['www.minirodini.com', 'minirodini.com'],
  pop: ['www.polarnopyret.se', 'polarnopyret.se'], newbie: ['www.kappahl.com', 'kappahl.com'],
  lindex: ['www.lindex.com', 'lindex.com'], tretorn: ['se.tretorn.com', 'www.tretorn.com'],
};
export const imageHosts = new Set(['media.arket.com', 'minirodini.centracdn.net', 'www.polarnopyret.se', 'polarnopyret.se', 'static.kappahl.com', 'i8.amplience.net', 'images.tretorn.eu']);
export function safeUrl(value, hosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}
export function storeSlug(value) {
  const text = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /polarn|pyret/.test(text) ? 'pop' : text;
}
export function publicProduct(row) {
  const store = storeSlug(row.retailer);
  return {
    id: String(row.id), name: String(row.name ?? '').slice(0, 300), brand: String(row.brand ?? store).slice(0, 100),
    store, price: Number(row.price_sek), color: productColor(row) ?? '', colorTone: colorTone(row),
    eco: row.eco === true, productGroupId: row.product_group_id ?? null,
    image: safeUrl(row.image_url, [...imageHosts]), url: safeUrl(row.product_url, retailerHosts[store] ?? []),
    appearance: { prints: row.print_tags ?? [], patterns: garmentPatterns(row), motifs: row.motif_tags ?? [], decorations: row.decoration_tags ?? [] },
    sizing: sizingForRow(row),
  };
}
