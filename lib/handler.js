import { randomUUID } from 'node:crypto';
import { securityHeaders, json, HttpError, boundedJson, originAllowed, enforceLimit, searchBody, objectBody } from './http.js';
import { getCatalogue, getProfiles } from './catalogue.js';
import { similarProducts, splitQuery } from './search.js';
import { searchVerified } from './search-stock.js';
import { verifyProducts } from './stock.js';
import { availableSizes } from '../public/availability.js';
import { publicProduct, storeSlug } from './links.js';
import { demoRetailerAllowed, DEMO_CHECKOUT_TIMEOUT } from '../public/retailers.js';

export function createHandler({ catalogue = getCatalogue, profiles = getProfiles, limiter = enforceLimit, stock = verifyProducts } = {}) {
  return async function handler(req, res, route) {
    securityHeaders(res);
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    try {
      originAllowed(req, res);
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); throw new HttpError(405, 'Metoden är inte tillåten.'); }
      await limiter(req, res);
      const body = await boundedJson(req);
      if (route === 'search') {
        const input = searchBody(body);
        if (splitQuery(input.query).length > 6) throw new HttpError(400, 'Sök efter högst sex plaggtyper åt gången.');
        const [data, brands] = await Promise.all([catalogue(), profiles()]);
        const groups = await searchVerified(data.rows.filter(row => demoRetailerAllowed(storeSlug(row.retailer))), input.query, brands, input, stock);
        return json(res, 200, { query: input.query, groups, catalogue: { source: data.source, updatedAt: data.updatedAt, stockPolicy: 'verified_sizes_5_minutes' } });
      }
      if (route === 'similar') {
        objectBody(body, ['referenceProductId']);
        if (typeof body.referenceProductId !== 'string' || !/^\d{1,18}$/.test(body.referenceProductId)) throw new HttpError(400, 'Ogiltig produktreferens.');
        const data = await catalogue();
        const result = similarProducts(data.rows.filter(row => demoRetailerAllowed(storeSlug(row.retailer))), body.referenceProductId);
        if (!result) throw new HttpError(404, 'Produkten är inte tillgänglig.');
        const checked = await stock(result.products);
        return json(res, 200, { ...result, products: checked.filter(product => availableSizes(product).length) });
      }
      if (route === 'stock') {
        objectBody(body, ['productIds']);
        if (!Array.isArray(body.productIds) || !body.productIds.length || body.productIds.length > 20 || body.productIds.some(id => typeof id !== 'string' || !/^\d{1,18}$/.test(id))) throw new HttpError(400, 'Välj högst 20 giltiga produktreferenser.');
        const data = await catalogue(), ids = new Set(body.productIds);
        const products = data.rows.filter(row => ids.has(String(row.id)) && demoRetailerAllowed(storeSlug(row.retailer))).map(publicProduct);
        return json(res, 200, { products: await stock(products, { signal: AbortSignal.timeout(DEMO_CHECKOUT_TIMEOUT) }) });
      }
      throw new HttpError(404, 'Sidan finns inte.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      // Log only generated identifiers and status. No queries, keys, provider bodies or exception messages.
      if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', requestId, status }));
      return json(res, status, { error: status >= 500 ? 'Sökningen är tillfälligt otillgänglig. Försök igen senare.' : error.message, requestId });
    }
  };
}
export const handler = createHandler();
