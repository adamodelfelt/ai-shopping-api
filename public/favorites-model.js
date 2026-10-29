export const FAVORITE_LIMIT = 100;
export function favoriteIds(values, limit = FAVORITE_LIMIT) {
  return [...new Set((Array.isArray(values) ? values : []).filter(id => typeof id === 'string' && /^\d{1,18}$/.test(id)))].slice(-limit);
}
export function createFavoriteStore(storage) {
  const key = 'whool:favorites:v1';
  let local = [], account = [], owner = null, persistent = Boolean(storage);
  try { local = favoriteIds(JSON.parse(storage?.getItem(key) ?? '[]')); } catch { persistent = false; }
  const persist = () => { try { storage?.setItem(key, JSON.stringify(local)); } catch { persistent = false; } };
  return {
    has: id => local.includes(id) || account.includes(id),
    ids: () => favoriteIds([...local, ...account]),
    localIds: () => [...local], accountIds: () => [...account], owner: () => owner,
    persistent: () => persistent,
    toggleLocal(id) {
      if (!favoriteIds([id]).length) throw new Error('Ogiltig favorit.');
      if (local.includes(id)) local = local.filter(value => value !== id);
      else { if (favoriteIds([...local, ...account]).length >= FAVORITE_LIMIT) throw new Error('Du kan spara högst 100 favoriter.'); local.push(id); }
      persist();
    },
    removeLocal(id) { local = local.filter(value => value !== id); persist(); },
    clearLocal() { local = []; persist(); },
    setAccount(userId, ids = []) { owner = userId || null; account = owner ? favoriteIds(ids) : []; },
  };
}
