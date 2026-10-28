// Vint stores only listing identifiers, independently of Whool Com.
const KEY='whool-vint-favorites-v1',valid=id=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
export function loadFavoriteIds(){try{const ids=JSON.parse(localStorage.getItem(KEY)||'[]');return new Set(Array.isArray(ids)?ids.filter(valid).slice(0,200):[]);}catch{return new Set();}}
export function persistFavoriteIds(ids){try{localStorage.setItem(KEY,JSON.stringify([...ids].filter(valid).slice(0,200)));}catch{}}
