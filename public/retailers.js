// Prototype assortment: only retailers with a complete local demo checkout.
// Removing an entry hides it even if a previous stock result is still cached.
export const prototypeRetailers = Object.freeze({
  minirodini: 'Mini Rodini',
  pop: 'Polarn O. Pyret',
  newbie: 'Kappahl / Newbie',
  lindex: 'Lindex',
  tretorn: 'Tretorn',
});
export const DEMO_CHECKOUT_TIMEOUT = 8000;
export function demoRetailerAllowed(store) { return Object.hasOwn(prototypeRetailers, store); }

// Opens the merchant's existing browser session. No cart or profile transfer.
const checkoutDestinations = Object.freeze({ lindex: 'https://www.lindex.com/se/checkout?hl=sv' });
export function storeCheckoutUrl(store) { return Object.hasOwn(checkoutDestinations, store) ? checkoutDestinations[store] : ''; }
