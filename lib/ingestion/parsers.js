import { clean, classifyName, validateProduct, adultName } from './model.js';

function scripts(html) { return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map(match => ({ attrs: match[1], text: match[2] })); }
export function scriptJson(html, id) {
  const script = scripts(html).find(item => new RegExp(`\\bid\\s*=\\s*["']${id}["']`, 'i').test(item.attrs));
  if (!script) throw new Error('Expected JSON payload missing');
  return JSON.parse(script.text);
}
export function assignedJson(html, name, { undefinedAsNull = false } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid payload name');
  const marker = new RegExp(`window\\.${name}\\s*=\\s*`);
  const source = scripts(html).find(item => marker.test(item.text))?.text;
  if (!source) throw new Error('Expected structured product payload missing');
  const assignment = marker.exec(source), tail = source.slice(assignment.index + assignment[0].length);
  if (tail[0] !== '{') throw new Error('Expected JSON object');
  let depth = 0, quoted = false, escaped = false, json = '';
  for (let index = 0; index < tail.length; index++) {
    const char = tail[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (undefinedAsNull && tail.slice(index).startsWith('undefined') && /[\s,\]}]/.test(tail[index + 9] ?? '')) { json += 'null'; index += 8; continue; }
    else if (char === '{') depth++;
    else if (char === '}') depth--;
    json += char;
    if (depth === 0) return JSON.parse(json);
  }
  throw new Error('Truncated product payload');
}
export function unpackNuxt(input) {
  // Decode the indexed JSON data format only. No source code or arbitrary revivers are executed.
  if (!Array.isArray(input) || input.length > 100_000) throw new Error('Invalid Nuxt data');
  const decoded = new Map();
  function visit(index, depth = 0) {
    if (depth > 100) throw new Error('Nested data limit');
    if (index === -1) return undefined;
    if (index === -2) return NaN;
    if (index === -3) return Infinity;
    if (index === -4) return -Infinity;
    if (index === -5) return -0;
    if (index === -6) return undefined;
    if (!Number.isInteger(index) || index < 0 || index >= input.length) throw new Error('Invalid Nuxt reference');
    if (decoded.has(index)) return decoded.get(index);
    const raw = input[index];
    if (raw === null || typeof raw !== 'object') return raw;
    if (Array.isArray(raw)) {
      if (typeof raw[0] === 'string') {
        if (raw[0] === 'Set') { const value = []; decoded.set(index, value); raw.slice(1).forEach(child => value.push(visit(child, depth + 1))); return value; }
        if (!['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef'].includes(raw[0])) throw new Error('Unsupported Nuxt data type');
        const value = visit(raw[1], depth + 1); decoded.set(index, value); return value;
      }
      const value = []; decoded.set(index, value); raw.forEach(child => value.push(visit(child, depth + 1))); return value;
    }
    const value = Object.create(null); decoded.set(index, value);
    for (const [key, child] of Object.entries(raw)) value[key] = visit(child, depth + 1);
    return value;
  }
  return visit(0);
}
export function parseArket(html) {
  const page = scriptJson(html, '__NEXT_DATA__');
  const listing = page.props?.pageProps?.blocks?.find(block => Array.isArray(block.products));
  if (!listing?.categoryArray?.some(value => /^children(?:\/|$)/.test(value)) || !Number.isInteger(listing.initialTotalItems) || !Number.isInteger(listing.pageSize) || listing.pageSize <= 0) throw new Error('ARKET market or pagination changed');
  return { items: listing.products, total: listing.initialTotalItems, pageSize: listing.pageSize, links: linksIn(html).filter(url => /^https:\/\/www\.arket\.com\/sv-se\/children\/clothing\/[a-z-]+\/$/.test(url)) };
}
export function mapArket(item) {
  if (!item.categoryUri?.startsWith('children/') || /shoes|toys/.test(item.categoryUri) || adultName(item.name)) return null;
  if (!item.sku || !/^[a-z0-9-]+$/.test(item.uri)) throw new Error('ARKET identity missing');
  const type = classifyName(item.name, item.categoryUri);
  if (!type.category) return null;
  return validateProduct({ ...type, name: clean(item.name), brand: 'ARKET', retailer: 'arket', product_url: `https://www.arket.com/sv-se/product/${item.uri}/`, image_url: item.mediaObjects?.map(media => media.attributes?.media_original_url).find(Boolean), product_group_id: item.product ? `arket__${item.product}` : null, price_sek: item.priceAsNumber, currency: /\bSEK\b/.test(item.price ?? '') ? 'SEK' : null, in_stock: item.available, target_age_group: /baby/.test(item.categoryUri) ? 'baby' : 'kids', color: item.var_colour_details_desc || item.variantName });
}
export function parseMini(html, address) {
  const data = assignedJson(html, '__remixContext');
  const response = data.state?.loaderData?.['gears-route-wildcard']?.pageResponse;
  const page = response?.page, item = page?.productData;
  if (!item) throw new Error('Mini Rodini product payload missing');
  const age = item.mp_age_group?.toLowerCase();
  if (!['kids', 'baby'].includes(age) && !/^(kids|baby)\//.test(item.categoryUri ?? '')) return null;
  if (/shoes|toys|gift-card|homeware/.test(item.categoryUri ?? '') || adultName(item.name)) return null;
  const type = classifyName(item.name, item.categoryUri);
  if (!type.category) return null;
  if (!Array.isArray(item.frontendItems) || !item.frontendItems.length || item.frontendItems.some(size => !Number.isFinite(size.stock) || size.stock < 0)) throw new Error('Mini Rodini size stock missing');
  return validateProduct({ ...type, name: clean(item.name), brand: 'Mini Rodini', retailer: 'minirodini', product_url: new URL(page.meta?.canonicalUrl || address, 'https://www.minirodini.com').href, image_url: item.mediaUrls?.[0], product_group_id: item.productSku ? `minirodini__${item.productSku}` : null, price_sek: item.price?.priceAsNumber, currency: response.frontendContext?.currencyCode, in_stock: item.frontendItems.some(size => size.stock > 0), target_age_group: age === 'baby' || item.categoryUri?.startsWith('baby/') ? 'baby' : 'kids', color: item.variantName, material: clean(item.mp_material_text), source_description: clean(item.description) });
}
const popTypes = { 'Sweaters/Hoodies': 'sweater', Trousers: 'pants', Dresses: 'dress', Overalls: 'overall', Leggings: 'pants', 'Shirts/Blouses': 'shirt', 'OW Overalls': 'overall', 'Gloves/Mittens': 'accessories', Skirts: 'skirt', 'Tops L/S': 'sweater', 'Tops S/S': 't-shirt', Bodies: 'body', Socks: 'socks', 'OW Layer': 'fleece', 'OW Trousers': 'pants', 'OW Jackets': 'jacket', 'Layer 2 Overalls': 'overall', 'Layer 1 Overalls': 'overall', 'Layer 1 Tops': 'sweater', 'Layer 2 Tops': 'sweater', Pyjamas: 'pyjamas', Nightgowns: 'pyjamas', 'Layer 1 Trousers': 'pants', 'Layer 2 Trousers': 'pants', Hats: 'accessories', 'Caps/Sunhats': 'accessories', 'Other Accessories': 'accessories', 'Long johns': 'underwear', Underpants: 'underwear', Knickers: 'underwear', Tights: 'socks', Swimwear: 'swimwear', Shorts: 'pants' };
export function parsePop(html) {
  const shell = assignedJson(html, 'APP_SHELL_DATA'), page = assignedJson(html, 'CURRENT_PAGE');
  if (shell.market?.id !== 'SE' || shell.market?.currency !== 'SEK' || !/^https:\/\/www\.polarnopyret\.se\/barnklader(?:\/|$)/.test(new URL(page.canonicalUrl, 'https://www.polarnopyret.se').href)) throw new Error('PO.P market changed');
  const list = page.productList;
  if (!Array.isArray(list?.products) || !Number.isInteger(list.totalItemCount) || !Number.isInteger(list.totalPages) || !Number.isInteger(list.currentPageIndex)) throw new Error('PO.P pagination missing');
  return { items: list.products, total: list.totalItemCount, pages: list.totalPages, page: list.currentPageIndex, links: (page.categoryTree?.categories ?? []).map(value => new URL(value.url, 'https://www.polarnopyret.se').href).filter(url => /^https:\/\/www\.polarnopyret\.se\/barnklader\/[a-z/-]+$/.test(url) && !url.includes('/kollektioner')) };
}
export function mapPop(item) {
  if (adultName(`${item.displayName} ${item.categoryName}`) || !popTypes[item.categoryName] || /mockasin|badlakan/i.test(item.displayName)) return null;
  const sizes = item.sizes;
  if (!Array.isArray(sizes) || !sizes.length || sizes.some(size => !Number.isFinite(size.totalAvailable) || size.totalAvailable < 0 || !size.sizeName)) throw new Error('PO.P stock unverified');
  const ages = sizes.flatMap(size => [...String(size.sizeAge ?? '').matchAll(/(\d+(?:[.,]\d+)?)\s*(M|Y)\b/gi)].map(match => Number(match[1].replace(',', '.')) / (match[2].toUpperCase() === 'M' ? 12 : 1)));
  if (ages.some(age => age > 17)) return null;
  const url = new URL(item.url, 'https://www.polarnopyret.se');
  if (!/^\d{8}$/.test(item.itemNumber) || !item.code || !new RegExp(`-${item.itemNumber}-[a-z0-9]+/?$`, 'i').test(url.pathname)) throw new Error('PO.P product identity mismatch');
  const type = classifyName(item.displayName); type.category ??= popTypes[item.categoryName]; type.subcategory ??= type.category;
  return validateProduct({ ...type, name: clean(item.displayName), brand: 'Polarn O. Pyret', retailer: 'pop', product_url: url.href, image_url: item.imageUrls?.[0] ? new URL(item.imageUrls[0], url.origin).href : null, product_group_id: `pop__${item.itemNumber}`, price_sek: item.price?.sellingPrice, currency: 'SEK', in_stock: sizes.some(size => size.totalAvailable > 0), target_age_group: ages.length && Math.max(...ages) <= 2 ? 'baby' : 'kids', color: item.color, source_description: item.oneLineText });
}
export function parseNewbie(html) {
  const shell = assignedJson(html, 'APP_SHELL_DATA'), page = assignedJson(html, 'CURRENT_PAGE');
  if (shell.currency !== 'SEK' || shell.currentCountry?.alpha2 !== 'SE' || !Array.isArray(page.products) || !Number.isInteger(page.totalProductCount) || !Number.isInteger(page.pageNumber) || !Number.isInteger(page.countPerPage) || page.countPerPage <= 0) throw new Error('Newbie market or pagination changed');
  return { items: page.products, total: page.totalProductCount, page: page.pageNumber, pages: Math.ceil(page.totalProductCount / page.countPerPage), links: linksIn(html, 'https://www.kappahl.com').filter(url => /^https:\/\/www\.kappahl\.com\/sv-se\/newbie\/[a-z0-9/-]+$/.test(url)) };
}
export function mapNewbie(item) {
  const url = new URL(item.url, 'https://www.kappahl.com');
  if (!url.pathname.startsWith('/sv-se/newbie/') || /newbie-woman|inredning|rooms|dekoration|leksak/.test(url.pathname) || item.brandName !== 'Newbie' || adultName(item.displayName)) return null;
  const type = classifyName(item.displayName, url.pathname.replaceAll('-', ' '));
  if (!type.category || /nalle|gift bag|filt|tacke|handduk|gosedjur|skor|toffl|mockasin/i.test(item.displayName)) return null;
  const image = item.images?.find(value => value.imageType === 'frontCutOut') ?? item.images?.[0];
  return validateProduct({ ...type, name: clean(item.displayName), brand: 'Newbie', retailer: 'newbie', product_url: url.href, image_url: image ? new URL(image.url, 'https://static.kappahl.com').href : null, product_group_id: `newbie:${item.lipscoreProductCode || item.code}`, price_sek: item.price?.current?.inclVat, currency: 'SEK', in_stock: item.buyable, target_age_group: /0-18-man|nyfodd/.test(url.pathname) || type.category === 'body' ? 'baby' : 'kids', color: item.color, source_pattern: item.pattern, source_description: item.usp });
}
export function parseLindex(html) {
  const page = unpackNuxt(scriptJson(html, '__NUXT_DATA__'));
  if (page.state?.$smarketSettings?.currencyCode !== 'SEK') throw new Error('Lindex currency changed');
  const listing = Object.values(page.data ?? {}).filter(item => item?.success === true).map(item => item.payload).find(item => Array.isArray(item?.variants));
  if (!listing) throw new Error('Lindex listing missing');
  return listing;
}
export function mapLindex(item, age) {
  if (!['kids', 'baby'].includes(age)) throw new Error('Lindex audience unverified');
  const type = classifyName(item.name);
  if (!type.category || adultName(item.name) || /paraply|rosa band|harsnodd|harspanne|skovard|kladvard|toffl|skor/i.test(item.name)) return null;
  if (!['Available', 'SoldOut', 'ComingSoon'].includes(item.variantStatus) || !/^\d+$/.test(String(item.styleId)) || !/^\d+$/.test(String(item.colorId)) || !/^[a-z0-9-]+$/.test(item.sanitizedName)) throw new Error('Lindex identity or stock missing');
  return validateProduct({ ...type, name: clean(item.name), brand: 'Lindex', retailer: 'lindex', product_url: `https://www.lindex.com/se/p/${item.styleId}-${item.colorId}-${item.sanitizedName}`, image_url: item.media?.fileName ? `https://i8.amplience.net/i/Lindex/${encodeURIComponent(item.media.fileName)}/${encodeURIComponent(item.sanitizedName)}?w=600&h=800&fmt=auto&qlt=70&sm=c` : null, product_group_id: `lindex:${item.styleId}`, price_sek: item.salePrice?.value ?? item.regularPrice?.value, currency: 'SEK', in_stock: item.variantStatus === 'Available', target_age_group: age, color: item.media?.altText?.split(' - ').at(-1) });
}
export function parseTretorn(html, expectedPage) {
  const context = assignedJson(html, 'INITIAL_DEPICT_CONTEXT', { undefinedAsNull: true });
  const listing = Object.values(context).find(item => item?.response?.displays && item?.options?.locale === 'sv_SE');
  if (!listing || listing.options.page !== expectedPage || !Number.isInteger(listing.response.n_hits) || !Number.isInteger(listing.options.hitsPerPage) || listing.options.hitsPerPage < 1) throw new Error('Tretorn pagination or market changed');
  return { items: listing.response.displays.flatMap(display => display.variant_displays ?? []), total: listing.response.n_hits, pageSize: listing.options.hitsPerPage };
}
export function mapTretorn(item) {
  if (!item.categories?.some(value => /barn/i.test(value)) || adultName(item.name)) return null;
  const type = classifyName(item.name);
  if (!type.category) return null;
  if (!Array.isArray(item.variations) || !item.variations.length || item.variations.some(size => typeof size.in_stock !== 'boolean') || !/SEK/.test(item.price?.sale_price_with_currency ?? '') || !/^[a-z0-9-]+$/i.test(item.sku)) throw new Error('Tretorn stock, currency or identity missing');
  return validateProduct({ ...type, name: clean(item.name), brand: 'Tretorn', retailer: 'tretorn', product_url: new URL(item.uri, 'https://se.tretorn.com').href, image_url: item.media?.[0], product_group_id: `tretorn:${item.sku.slice(0, 6)}`, price_sek: item.price.sale_price, currency: 'SEK', in_stock: item.variations.some(size => size.in_stock), target_age_group: 'kids', color: item.custom_attributes?.attr_color?.title, source_description: item.short_description });
}
export function linksIn(html, origin = 'https://www.arket.com') {
  return [...new Set([...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].flatMap(match => { try { return [new URL(match[1].replaceAll('&amp;', '&'), origin).href]; } catch { return []; } }))];
}
export function sitemapUrls(xml) {
  return [...new Set([...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(match => match[1].trim().replaceAll('&amp;', '&')).filter(url => { try { const value = new URL(url); return value.origin === 'https://www.minirodini.com' && value.pathname.startsWith('/se/'); } catch { return false; } }))];
}
