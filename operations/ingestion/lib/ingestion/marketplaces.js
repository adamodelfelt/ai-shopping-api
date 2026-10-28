import { clean, classifyName } from './model.js';

export function parseMarketplace(html, address, store) {
  const host = { stadium: 'www.stadium.se', ahlens: 'www.ahlens.se' }[store];
  const url = new URL(address);
  if (!host || url.origin !== `https://${host}`) throw new Error('Unexpected marketplace URL');
  const documents = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const data = JSON.parse(match[1]);
    documents.push(...(Array.isArray(data) ? data : [data]));
  }
  const nodes = documents.flatMap(node => node['@graph'] ?? [node]);
  const group = nodes.find(node => ['ProductGroup','Product'].includes(node['@type']) && node.name);
  if (!group) throw new Error('Product JSON-LD missing');
  const variants = (group.hasVariant?.length ? group.hasVariant : [group]).map(variant => {
    const offer = Array.isArray(variant.offers) ? variant.offers[0] : variant.offers ?? {};
    return { sku: variant.sku ?? offer.sku ?? null, gtin: variant.gtin ?? variant.gtin13 ?? null, size: variant.size ?? null, color: variant.color ?? group.color ?? null, price: offer.price === undefined ? null : Number(offer.price), currency: offer.priceCurrency ?? null, availability: offer.availability ?? null, url: variant.url ?? address, seller: offer.seller?.name ?? null };
  });
  const description = clean(group.description);
  // Material remains a source quote. Missing composition stays null and blocks approval.
  const material = (String(group.description ?? '').match(/Huvudmaterial:\s*([^\n<]+)/i)?.[1]
    ?? html.match(/Ytterlager:\s*(?:<[^>]*>\s*)*([^<\n]{3,160})/i)?.[1]
    ?? null);
  const childEvidence = /\/barn\//.test(url.pathname) || /\bbarn\b|\bkids\b|\bjunior\b/i.test(group.name);
  const knownStock = variants.every(v => /\/(InStock|OutOfStock|SoldOut|PreOrder|BackOrder)$/.test(v.availability ?? ''));
  const inStock = variants.some(v => /\/InStock$/.test(v.availability ?? '')) ? true : knownStock ? false : null;
  const prices = [...new Set(variants.map(v => v.price))];
  const currencies = [...new Set(variants.map(v => v.currency))];
  const type = classifyName(group.name, description);
  const proposed = {
    name: clean(group.name), brand: clean(typeof group.brand === 'string' ? group.brand : group.brand?.name), retailer: store,
    product_url: address, image_url: Array.isArray(group.image) ? group.image[0] : group.image ?? null,
    product_group_id: group.productGroupID ?? null, price_sek: currencies.length === 1 && currencies[0] === 'SEK' && prices.length === 1 ? prices[0] : null,
    in_stock: inStock, target_age_group: childEvidence ? 'kids' : null, target_gender: null,
    category: type.category, subcategory: type.subcategory, color: group.color ?? null,
    material: material ? clean(material) : null, source_description: description,
    classification: { version: 'whool-marketplace-pilot-1', review_state: 'needs_review', unknown_axes: ['size_age_mapping','appearance','material_evidence','seller'] },
  };
  return { source_key: String(group.productGroupID ?? address), source_url: address,
    raw_data: { json_ld: group, currency: currencies.length === 1 ? currencies[0] : null, variants, material_evidence: proposed.material, child_audience_evidence: childEvidence ? (url.pathname.includes('/barn/') ? 'source path /barn/' : group.name) : null, parser_version: 'marketplace-pilot-1' },
    proposed_product: proposed };
}
