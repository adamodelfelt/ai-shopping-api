import { parseArket, mapArket, parseMini, parsePop, mapPop, parseNewbie, mapNewbie, parseLindex, mapLindex, parseTretorn, mapTretorn, sitemapUrls } from './parsers.js';

export const stores = {
  arket: { origin: 'https://www.arket.com', root: '/sv-se/children/clothing/', parse: parseArket, map: mapArket, identity: item => item.sku },
  pop: { origin: 'https://www.polarnopyret.se', root: '/barnklader', parse: parsePop, map: mapPop, identity: item => item.code },
  newbie: { origin: 'https://www.kappahl.com', root: '/sv-se/newbie', parse: parseNewbie, map: mapNewbie, identity: item => item.code },
  minirodini: { origin: 'https://www.minirodini.com' },
  lindex: { origin: 'https://www.lindex.com' },
  tretorn: { origin: 'https://se.tretorn.com' },
};
export async function collect(store, get, { limit = 10_000 } = {}) {
  const definition = stores[store]; if (!definition) throw new Error('Unknown retailer');
  const products = new Map(), sourceIds = new Set(); let pages = 0, excluded = 0, expected = null;
  let limited = false;
  function add(item, mapper, identity) {
    if (!identity || typeof identity !== 'string' && typeof identity !== 'number') throw new Error('Missing source product identity');
    if (sourceIds.has(String(identity))) return;
    sourceIds.add(String(identity));
    const product = mapper(item);
    if (product) products.set(product.product_url, product); else excluded++;
    if (products.size >= limit) limited = true;
  }
  if (['arket', 'pop', 'newbie'].includes(store)) {
    const root = new URL(definition.root, definition.origin).href;
    const queue = [root], visited = new Set();
    while (queue.length && !limited) {
      const address = queue.shift(); if (visited.has(address)) continue;
      if (visited.size >= 200) throw new Error('Category safety limit exceeded');
      visited.add(address); let totalPages = 1, categoryTotal;
      const fingerprints = new Set();
      for (let page = 1; page <= totalPages && !limited; page++) {
        const url = new URL(address); if (page > 1 || store === 'newbie') url.searchParams.set('page', String(page));
        const listing = definition.parse(await get(url.href)); pages++;
        if (listing.page !== undefined && listing.page !== page || !listing.items.length || listing.total < 1) throw new Error('Empty or unexpected retailer page');
        if (categoryTotal !== undefined && categoryTotal !== listing.total) throw new Error('Catalogue changed during collection');
        categoryTotal = listing.total;
        if (expected === null) expected = listing.total;
        totalPages = listing.pages ?? Math.ceil(listing.total / listing.pageSize);
        if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 150) throw new Error('Page count safety limit exceeded');
        const fingerprint = listing.items.map(definition.identity).join('|');
        if (fingerprints.has(fingerprint)) throw new Error('Repeated retailer page');
        fingerprints.add(fingerprint);
        for (const item of listing.items) { add(item, definition.map, definition.identity(item)); if (limited) break; }
        for (const link of listing.links ?? []) if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
      if (sourceIds.size >= expected) break;
    }
    if (!limited && sourceIds.size < expected) throw new Error('Catalogue coverage gap; partial results cannot be imported');
  } else if (store === 'minirodini') {
    const addresses = sitemapUrls(await get(`${definition.origin}/sitemap/products/se`)); pages++;
    if (!addresses.length || addresses.length > 10_000) throw new Error('Invalid product sitemap');
    expected = addresses.length;
    for (const url of addresses) { const html = await get(url); pages++; add(html, value => parseMini(value, url), url); if (limited) break; }
  } else if (store === 'tretorn') {
    for (let page = 1; page <= 150; page++) {
      const listing = parseTretorn(await get(`${definition.origin}/barn/ytterklader?page=${page}`), page); pages++;
      if (expected !== null && expected !== listing.total || !listing.items.length) throw new Error('Catalogue changed or became empty');
      expected = listing.total; const before = sourceIds.size;
      for (const item of listing.items) { add(item, mapTretorn, item.sku); if (limited) break; }
      if (limited) break;
      if (sourceIds.size === before) throw new Error('Repeated page');
      if (page * listing.pageSize >= expected) break;
      if (page === 150) throw new Error('Page safety limit exceeded');
    }
    if (!limited && sourceIds.size !== expected) throw new Error('Tretorn coverage mismatch');
  } else if (store === 'lindex') {
    for (const scope of [{ route: 'barn', category: '1034207', age: 'kids' }, { route: 'baby', category: '1034208', age: 'baby' }]) {
      let listing = parseLindex(await get(`${definition.origin}/se/${scope.route}`)); pages++;
      const total = listing.totalCount, pageSize = listing.pageSize;
      if (!Number.isInteger(total) || total < 1 || !Number.isInteger(pageSize) || pageSize < 1) throw new Error('Lindex invalid total');
      const seen = new Set();
      for (let index = 0; index * pageSize < total && index < 150; index++) {
        if (index) {
          const query = new URLSearchParams({ categoryIds: `catalog01_1033146_1033146a${scope.category}`, country: 'se', pageSize: String(pageSize), startIndex: String(index * pageSize) });
          const response = JSON.parse(await get(`${definition.origin}/api/products/list?${query}`)); pages++;
          if (!response.success || response.status !== 200) throw new Error('Lindex listing API unavailable');
          listing = response.payload;
        }
        if (listing.totalCount !== total || listing.startIndex !== index * pageSize || !Array.isArray(listing.variants) || !listing.variants.length) throw new Error('Lindex pagination changed');
        const before = seen.size;
        for (const item of listing.variants) { const id = `${item.styleId}:${item.colorId}`; seen.add(id); add(item, value => mapLindex(value, scope.age), id); if (limited) break; }
        if (limited) break;
        if (seen.size === before) throw new Error('Lindex repeated page');
      }
      if (!limited && seen.size !== total) throw new Error('Lindex coverage gap');
      if (limited) break;
    }
    expected = sourceIds.size;
  }
  return { store, complete: !limited, collectedAt: new Date().toISOString(), scope: store === 'tretorn' ? 'children outerwear' : 'children and baby clothing', sourceCount: sourceIds.size, expected, pages, excluded, products: [...products.values()].map(row => ({ ...row, currency: 'SEK' })) };
}
