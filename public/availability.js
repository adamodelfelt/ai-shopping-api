export const STOCK_TTL = 5 * 60_000;
export function stockFresh(stock, now = Date.now()) {
  const age = now - Date.parse(stock?.checkedAt);
  return stock?.status === 'verified' && Number.isFinite(age) && age >= -5000 && age < STOCK_TTL;
}
export function availableSizes(product, now = Date.now()) {
  return stockFresh(product.availability, now) ? (product.availability.sizes ?? []).filter(size => size.available === true) : [];
}
export function sizeMatches(label, requested) {
  const numbers = text => String(text).match(/\d{2,3}/g)?.map(Number) ?? [];
  const actual = numbers(label), wanted = numbers(requested);
  if (!wanted.length) return true;
  if (!actual.length) return false;
  return Math.max(Math.min(...actual), Math.min(...wanted)) <= Math.min(Math.max(...actual), Math.max(...wanted));
}
