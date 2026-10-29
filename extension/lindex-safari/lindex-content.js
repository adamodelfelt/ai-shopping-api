(() => {
  if (location.origin !== 'https://www.lindex.com' || !location.pathname.startsWith('/se/') || window !== window.top) return;
  const api = typeof browser !== 'undefined' ? browser : chrome;
  let cancelled = false, currentJob, checkpoint = 'initial';
  const text = item => (item?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const size = value => String(value).replace(/[\s–—-]+/g, '/').replace(/\/+/, '/').trim();
  const visible = item => item && item.getClientRects().length > 0 && !item.closest('[hidden],[inert]');
  const identity = value => { const url = new URL(value, location.origin); const match = url.origin === location.origin && url.pathname.match(/^\/se\/p\/(\d+)-(\d+)-/); if (!match) throw new Error('identity'); return `${match[1]}:${match[2]}`; };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(read, timeout = 15_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (cancelled) throw new Error('cancelled'); const result = read(); if (result) return result; await pause(150); }
    throw new Error('timeout');
  }
  const message = value => api.runtime.sendMessage(value);
  let banner;
  function notice(value, done = false) {
    if (!banner) {
      const host = document.createElement('section'); host.id = 'whool-transfer-notice'; host.setAttribute('role', 'status'); host.style.cssText = 'position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;background:#f1f6e8;color:#254d38;border:2px solid #346a4e;border-radius:14px;padding:16px;font:14px system-ui;box-shadow:0 8px 30px #0002';
      banner = document.createElement('p'); banner.style.margin = '0'; host.append(banner);
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Avbryt Whool';
      cancel.addEventListener('click', () => { cancelled = true; if (currentJob) message({ kind: 'lindex-stop', id: currentJob.id }); banner.textContent = 'Whool: Avbrutet. Ingen beställning har gjorts.'; cancel.remove(); });
      host.append(cancel); document.documentElement.append(host);
    }
    banner.textContent = `Whool: ${value}`;
    if (done) banner.parentElement.querySelector('button')?.remove();
  }
  function namedButton(name) { return [...document.querySelectorAll('button')].find(button => visible(button) && !button.disabled && text(button) === name); }
  function amounts(value) { return [...value.matchAll(/(\d[\d\s\u00a0]*[,.]\d{2})\s*(?:kr|SEK)/g)].map(match => Math.round(Number(match[1].replace(/\s/g, '').replace(',', '.')) * 100)); }
  function cartRows(job) {
    const main = document.querySelector('main'); if (!main) return null;
    if (/Din shoppingbag är tom/.test(text(main))) return [];
    const selects = [...main.querySelectorAll('select[id^="product-quantity_"]')];
    if (!selects.length) return null;
    return selects.map(select => {
      let row = select.parentElement;
      for (let count = 0; count < 10 && row && row !== main; count++, row = row.parentElement) {
        const links = [...row.querySelectorAll('a[href*="/se/p/"]')];
        if (!links.length || row.querySelectorAll('select[id^="product-quantity_"]').length !== 1) continue;
        const term = [...row.querySelectorAll('.cart-product__variant dt')].find(item => /^Storlek:?$/.test(text(item)));
        const value = term?.nextElementSibling;
        if (!value || value.tagName !== 'DD' || !text(value)) continue;
        const identities = new Set(links.map(link => identity(link.href)));
        if (identities.size !== 1) throw new Error('cart fields');
        const linkPrices = links.flatMap(link => amounts(text(link) + ' ' + (link.getAttribute('aria-label') ?? '')));
        const prices = [...new Set(linkPrices.length ? linkPrices : amounts(text(row)))];
        if (prices.length !== 1) throw new Error('cart fields');
        const quantity = Number(select.value);
        const product = [...identities][0], selectedSize = text(value);
        const expected = job.items.find(item => item.identity === product && size(item.size) === size(selectedSize));
        const observedPrice = prices[0];
        const unitMinor = expected && observedPrice === expected.unitMinor * quantity ? expected.unitMinor : observedPrice;
        return { identity: product, size: selectedSize, quantity, unitMinor };
      }
      throw new Error('cart structure');
    });
  }
  function inputValue(input, value) {
    if (!input || input.disabled || input.readOnly || !visible(input) || typeof value !== 'string' || input.maxLength > 0 && value.length > input.maxLength) throw new Error('field');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function product(job) {
    checkpoint = 'product_variant';
    const item = job.item;
    if (identity(location.href) !== item.identity || new URL(location.href).searchParams.get('sku') !== item.sku) throw new Error('wrong variant');
    const radio = await waitFor(() => [...document.querySelectorAll('input[type="radio"]')].find(input => input.id.startsWith(`${item.sku}_`)));
    const label = text(radio.labels?.[0]) || radio.getAttribute('aria-label');
    if (radio.disabled || size(label) !== size(item.size)) throw new Error('unavailable variant');
    if (!radio.checked) radio.click();
    await waitFor(() => radio.checked);
    const add = await waitFor(() => namedButton('Lägg till i shoppingbagen'));
    const heading = document.querySelector('main h1'); if (!heading) throw new Error('product heading');
    // Only inspect the product area, excluding recommendations further down the page.
    let area = heading.parentElement;
    while (area && !area.contains(add) && area.tagName !== 'MAIN') area = area.parentElement;
    if (!area || area.tagName === 'MAIN') throw new Error('product area');
    checkpoint = 'product_price';
    const prices = amounts(text(area));
    if (!prices.length || prices[0] !== item.unitMinor) throw new Error('price changed');
    checkpoint = 'product_add';
    const permitted = await message({ kind: 'lindex-begin-add', id: job.id });
    if (!permitted?.permitted || cancelled) throw new Error('not permitted');
    add.click();
    checkpoint = 'product_confirm';
    await waitFor(() => [...document.querySelectorAll('h2,h3,p,span,[role="status"]')].some(item => visible(item) && text(item) === 'Tillagd i shoppingbagen'), 12_000);
    await message({ kind: 'lindex-go-cart', id: job.id });
  }
  async function address(job) {
    checkpoint = 'address_load';
    await waitFor(() => document.querySelector('input[id^="firstName_"]'));
    if (location.pathname !== '/se/checkout/address') throw new Error('wrong checkout');
    const fields = job.fields;
    const email = document.querySelector('main input[id^="email_"][name="email"][autocomplete="email"]');
    const phone = [...document.querySelectorAll('input[type="tel"]')].find(input => !input.disabled && visible(input));
    const values = [[email, fields.email], [phone, fields.phone]];
    for (const name of ['firstName', 'lastName', 'addressLine1', 'addressLine2', 'postalCode', 'city']) values.push([document.querySelector(`input[id^="${name}_"]`), fields[name]]);
    checkpoint = 'address_fill';
    for (const [input, value] of values) inputValue(input, value);
    await pause(250); checkpoint = 'address_verify';
    for (const [input, value] of values) if (input.value !== value || !input.checkValidity()) throw new Error('field validation');
    const result = await message({ kind: 'lindex-filled', id: job.id });
    if (!result?.ok) throw new Error('verification');
    notice('Varukorgen och leveransuppgifterna är förberedda. Granska dem och välj själv leverans och betalning. Ingen beställning har gjorts.', true);
  }
  async function run() {
    let result;
    for (let count = 0; count < 12; count++) { result = await message({ kind: 'lindex-job' }); if (result?.job) break; await pause(300); }
    if (!result?.job) return;
    currentJob = result.job;
    notice('Förbereder ditt val från Whool. Ingen beställning eller betalning genomförs.');
    await waitFor(() => document.readyState === 'complete');
    await pause(250);
    // Accept only the necessary-cookie choice; never a membership or terms agreement.
    const necessary = namedButton('ENDAST NÖDVÄNDIGA COOKIES'); necessary?.click();
    if (['inspect_cart', 'verify_cart'].includes(currentJob.phase) && location.pathname === '/se/cart') {
      checkpoint = 'cart_read';
      const rows = await waitFor(() => cartRows(currentJob));
      checkpoint = 'cart_check';
      const response = await message({ kind: 'lindex-cart', id: currentJob.id, rows }); if (!response?.ok) { checkpoint += ':' + (['tab-owner', 'expired', 'step', 'sender', 'origin', 'type', 'check', 'cart-data', 'navigate-address', 'navigate-product', 'product-url', 'rows-type', 'items-type', 'rows-limit', 'empty-items'].includes(response?.code) ? response.code : 'unknown'); throw new Error('cart mismatch'); }
    } else if (currentJob.phase === 'product') await product(currentJob);
    else if (currentJob.phase === 'address') await address(currentJob);
    else throw new Error('unexpected page');
  }
  run().catch(async error => {
    if (!currentJob) return;
    try { await message({ kind: 'lindex-stop', id: currentJob.id, checkpoint }); } catch { /* No profile values or merchant details are logged. */ }
    const reasons = new Set(['timeout', 'cart fields', 'cart structure', 'wrong variant', 'unavailable variant', 'product heading', 'product area', 'price changed', 'not permitted', 'cart mismatch', 'field', 'field validation', 'verification', 'unexpected page']);
    const reason = reasons.has(error.message) ? error.message : 'runtime';
    notice(`Överföringen stoppades (${checkpoint}/${reason}). Granska Lindex-fliken innan du fortsätter. Ingen beställning har gjorts.`, true);
  });
})();
