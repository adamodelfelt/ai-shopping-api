import { favoriteIds } from './favorites-model.js';

// Only public product IDs may enter persistent browser storage. Never account tokens or profiles.
export function browserFavoriteStorage(browser = window) {
  try {
    const storage = browser.localStorage, key = 'whool:favorites:v1';
    if (!storage) return undefined;
    return {
      getItem(requested) { if (requested !== key) throw new Error('Invalid storage key'); return storage.getItem(key); },
      setItem(requested, value) {
        if (requested !== key || typeof value !== 'string' || value.length > 2400) throw new Error('Invalid favorites storage');
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || JSON.stringify(favoriteIds(parsed)) !== value) throw new Error('Only public product IDs may be stored');
        storage.setItem(key, value);
      },
    };
  } catch { return undefined; }
}
