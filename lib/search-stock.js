import { searchCatalogue } from './search.js';
import { availableSizes, sizeMatches } from '../public/availability.js';
import { prototypeRetailers } from '../public/retailers.js';

// Search beyond the first display page without increasing the outbound safety budget.
export async function searchVerified(rows, query, profiles, options, stock, { signal = AbortSignal.timeout(28_000) } = {}) {
  const groups = searchCatalogue(rows, query, profiles, { ...options, candidateLimit: 32 });
  const pools = groups.map(group => group.products);
  const checked = new Map();
  const fits = (product, group) => {
    const size = group.sourceQuery.match(/\b\d{2,3}(?:\s*[/-]\s*\d{2,3})?\b/)?.[0];
    return product && availableSizes(product).some(variant => !size || sizeMatches(variant.label, size));
  };
  for (const group of groups) group.products = [];
  while (!signal.aborted && checked.size < 48) {
    const batch = new Map();
    for (const [index, group] of groups.entries()) {
      if (group.products.length >= 8) continue;
      let added = 0;
      for (const product of pools[index]) {
        if (checked.has(product.id) || batch.has(product.id)) continue;
        if (checked.size + batch.size >= 48 || added >= 4) break;
        batch.set(product.id, product); added++;
      }
    }
    if (!batch.size) break;
    const results = new Map((await stock([...batch.values()], { signal })).map(product => [product.id, product]));
    for (const product of batch.values()) checked.set(product.id, results.get(product.id));
    for (const [index, group] of groups.entries()) group.products = pools[index].map(product => checked.get(product.id)).filter(product => fits(product, group)).slice(0, 8);
  }
  for (const [index, group] of groups.entries()) {
    const inspected = pools[index].filter(product => checked.has(product.id));
    const unknownStores = [...new Set(inspected.filter(product => !checked.get(product.id) || checked.get(product.id).availability?.status === 'unknown').map(product => prototypeRetailers[product.store]).filter(Boolean))];
    const notices = [group.notice];
    if (unknownStores.length) notices.push(`Lager hos ${unknownStores.join(', ')} kunde inte verifieras just nu. De plaggen visas inte.`);
    if (!group.products.length && inspected.length) notices.push('Inga matchande plagg med bekräftat lager hittades. Prova en annan sökning.');
    else if (group.products.length && inspected.some(product => !fits(checked.get(product.id), group))) notices.push('Visar endast plagg med kontrollerat lager i efterfrågad storlek.');
    group.notice = notices.filter(Boolean).join(' ');
  }
  return groups;
}
