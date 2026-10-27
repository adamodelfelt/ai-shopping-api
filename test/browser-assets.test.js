import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';

test('the local server serves the complete browser module graph and keeps private files inaccessible', async () => {
  const server = createApp(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const pending = ['/app.js'], visited = new Set();
    while (pending.length) {
      const path = pending.shift(); if (visited.has(path)) continue; visited.add(path);
      const response = await fetch(origin + path); assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /javascript/, path);
      const source = await response.text();
      for (const match of source.matchAll(/from\s+['"]\.\/([^'"]+\.js)['"]/g)) pending.push('/' + match[1]);
    }
    assert.ok(visited.has('/favorites-model.js')); assert.ok(visited.has('/favorites-storage.js'));
    for (const path of ['/.env.local', '/lib/accounts/session.js', '/db/accounts.sql']) assert.equal((await fetch(origin + path)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
