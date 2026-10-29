import { assignedJson, scriptJson, unpackNuxt } from './parsers.js';
import { safeUrl, retailerHosts } from '../links.js';

function list(items, mapper) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Missing size inventory');
  const sizes = items.map(mapper), seen = new Set();
  for (const size of sizes) {
    if (!size.id || !size.label || size.id.length > 100 || size.label.length > 30 || typeof size.available !== 'boolean' || seen.has(size.id)) throw new Error('Unverified size inventory');
    seen.add(size.id);
  }
  return sizes;
}
function numeric(value) { if (!Number.isFinite(value) || value < 0) throw new Error('Unknown inventory count'); return value; }
function samePath(a, b) { return new URL(a).pathname.replace(/\/$/, '') === new URL(b, a).pathname.replace(/\/$/, ''); }
function findProduct(root, style, color, depth = 0) {
  if (!root || typeof root !== 'object' || depth > 10) return null;
  if (String(root.styleId) === style && String(root.colorId) === color && Array.isArray(root.sizes) && root.sizes.some(size => size.stockOnHand !== undefined)) return root;
  for (const value of Object.values(root)) { const result = findProduct(value, style, color, depth + 1); if (result) return result; }
  return null;
}
export function parseStock(store, html, url, checkedAt = new Date().toISOString()) {
  if (!safeUrl(url, retailerHosts[store] ?? [])) throw new Error('Invalid retailer URL');
  let sizes, price, currency;
  if (store === 'minirodini') {
    const response = assignedJson(html, '__remixContext').state?.loaderData?.['gears-route-wildcard']?.pageResponse;
    const product = response?.page?.productData;
    if (!product || !samePath(url, response.page.meta?.canonicalUrl || `/se/${product.uri}`)) throw new Error('Product identity changed');
    currency = response.frontendContext?.currencyCode; price = product.price?.priceAsNumber;
    sizes = list(product.frontendItems, item => ({ id: String(item.item ?? ''), label: String(item.name ?? ''), available: numeric(item.stock) > 0, quantity: item.stock }));
  } else if (store === 'pop' || store === 'newbie') {
    const page = assignedJson(html, 'CURRENT_PAGE'), shell = assignedJson(html, 'APP_SHELL_DATA');
    const sameNewbieCode = store === 'newbie' && /^\d+$/.test(String(page.code)) && new URL(url).pathname.split('/').filter(Boolean).at(-1) === String(page.code);
    if (!sameNewbieCode && !samePath(url, page.url || page.canonicalUrl)) throw new Error('Product identity changed');
    currency = page.currency ?? shell.currency;
    if (store === 'pop') {
      price = page.price?.sellingPrice;
      sizes = list(page.sizes, item => ({ id: String(item.code ?? ''), label: String(item.sizeName ?? '').replace(/\s*-\s*/g, '/'), available: numeric(item.totalAvailable) > 0 && page.outOfStock === false, quantity: item.totalAvailable, price: item.price?.sellingPrice }));
    } else {
      price = page.price?.current?.inclVat;
      sizes = list(page.variations, item => {
        if (!['high', 'low', 'none', 'outOfStock', 'soldOut'].includes(item.stock)) throw new Error('Unknown stock status');
        return { id: String(item.code ?? ''), label: String(item.displayName ?? ''), available: page.buyable === true && ['high', 'low'].includes(item.stock) && page.trackingProduct?.skusInStock?.includes(item.code), price: item.price?.current?.inclVat };
      });
    }
  } else if (store === 'lindex') {
    const identity = new URL(url).pathname.match(/\/p\/(\d+)-(\d+)-/);
    if (!identity) throw new Error('Missing product identity');
    const data = unpackNuxt(scriptJson(html, '__NUXT_DATA__'));
    currency = data.state?.$smarketSettings?.currencyCode;
    const product = findProduct(data.data, identity[1], identity[2]);
    if (!product) throw new Error('Product identity changed');
    price = product.price?.value;
    sizes = list(product.sizes, item => {
      if (!['Available', 'SoldOut', 'ComingSoon'].includes(item.status)) throw new Error('Unknown stock status');
      return { id: String(item.skuId ?? ''), label: String(item.sizeName ?? ''), available: item.status === 'Available' && numeric(item.stockOnHand) > 0, quantity: item.stockOnHand };
    });
  } else if (store === 'tretorn') {
    // The state is a JSON string containing JSON, never executable source.
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*("(?:\\.|[^"\\])*")/);
    if (!match) throw new Error('Missing product state');
    const product = JSON.parse(JSON.parse(match[1])).page?.data;
    if (!product?.sku || !new URL(url).pathname.endsWith(`-${product.sku}`)) throw new Error('Product identity changed');
    price = product.price?.salePrice; currency = product.price?.currency?.id;
    sizes = list(product.variations, item => {
      if (typeof item.inStock !== 'boolean') throw new Error('Unknown stock status');
      return { id: String(item.id ?? ''), label: String(item.name ?? ''), available: item.inStock };
    });
  } else {
    // Only explicit per-size offers are accepted; aggregate availability is insufficient.
    const offers = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
      try { const value = JSON.parse(match[1]); return Array.isArray(value) ? value : [value]; } catch { return []; }
    }).filter(item => item['@type'] === 'Product' && item.url && samePath(url, item.url)).flatMap(item => Array.isArray(item.offers) ? item.offers : []);
    sizes = list(offers, offer => ({ id: String(offer.sku ?? ''), label: String(offer.size ?? ''), available: offer.availability === 'https://schema.org/InStock' }));
    currency = offers[0]?.priceCurrency; price = Number(offers[0]?.price);
  }
  if (currency !== 'SEK' || !Number.isFinite(price) || price < 0 || price > 100_000) throw new Error('Unverified SEK price');
  for (const size of sizes) {
    size.price ??= price;
    if (!Number.isFinite(size.price) || size.price < 0 || size.price > 100_000) throw new Error('Unverified size price');
  }
  const available = sizes.filter(size => size.available);
  return { status: available.length ? 'verified' : 'unavailable', checkedAt, price: available.length ? Math.min(...available.map(size => size.price)) : price, sizes };
}
