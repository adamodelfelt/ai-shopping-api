export function unique(products) { return [...new Map(products.map(product => [product.id, product])).values()]; }
export function makeGroup(group) { return { ...group, pool: unique(group.products ?? []), pinned: new Set(), dismissed: new Set(), count: 4, busy: false }; }
export function visible(group) {
  const saved = group.pool.filter(product => group.pinned.has(product.id));
  const rest = group.pool.filter(product => !group.pinned.has(product.id) && !group.dismissed.has(product.id));
  return [...saved, ...rest].slice(0, group.count);
}
export function mergeRefresh(group, incoming, query = group.sourceQuery) {
  const pinned = query === group.sourceQuery ? group.pool.filter(product => group.pinned.has(product.id)) : [];
  return { ...group, ...incoming, sourceQuery: query, pool: unique([...pinned, ...(incoming?.products ?? [])]), pinned: new Set(pinned.map(product => product.id)), dismissed: new Set(), busy: false };
}
