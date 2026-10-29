(() => {
  if (!['http://127.0.0.1:3000', 'http://localhost:3000'].includes(location.origin) || window !== window.top) return;
  const api = typeof browser !== 'undefined' ? browser : chrome;
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'whool-lindex-v1' || event.data.direction !== 'request') return;
    const { requestId, action, payload } = event.data;
    if (typeof requestId !== 'string' || requestId.length > 80 || !['capabilities', 'start', 'status', 'cancel'].includes(action)) return;
    try {
      const result = await api.runtime.sendMessage({ kind: `whool-${action}`, payload });
      window.postMessage({ channel: 'whool-lindex-v1', direction: 'reply', requestId, result }, location.origin);
    } catch {
      window.postMessage({ channel: 'whool-lindex-v1', direction: 'reply', requestId, result: { ok: false, message: 'Safari-kopplingen kunde inte nås.' } }, location.origin);
    }
  });
})();
