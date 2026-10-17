import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dropboxDownloadUrl, uploadDropbox, validateDropbox } from '../src/dropbox-storage.js';

test('Dropbox direct URL retains shared link key and rejects unexpected hosts', () => {
  const url = new URL(dropboxDownloadUrl('https://www.dropbox.com/scl/fi/id/art.png?rlkey=key&dl=0'));
  assert.equal(url.searchParams.get('rlkey'), 'key');
  assert.equal(url.hostname, 'dl.dropboxusercontent.com');
  assert.equal(url.searchParams.has('raw'), false);
  assert.equal(url.searchParams.has('dl'), false);
  assert.throws(() => dropboxDownloadUrl('https://example.com/art.png'));
});
test('Dropbox refresh, upload, public link creation and existing-link reuse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dbx-test-'));
  const env = { ...process.env }, originalFetch = globalThis.fetch;
  let conflict = false, refreshes = 0, uploadCount = 0;
  process.env.DROPBOX_APP_KEY = 'test'; process.env.DROPBOX_TOKEN_FILE = join(dir, 'tokens.json');
  try {
    await assert.rejects(validateDropbox(), /dropbox:connect/);
    await writeFile(process.env.DROPBOX_TOKEN_FILE, JSON.stringify({ appKey: 'test', access_token: 'old', refresh_token: 'refresh', expires_at: 0 }));
    const image = join(dir, 'art.png'); await writeFile(image, 'png-fixture');
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target.startsWith('https://dl.dropboxusercontent.com/')) {
        assert.equal(init?.redirect, 'error');
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        return new Response('png-fixture', { headers: { 'Content-Type': 'image/png' } });
      }
      if (target.endsWith('/oauth2/token')) { refreshes++; return Response.json({ access_token: 'new', expires_in: 14400 }); }
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer new');
      if (target.endsWith('/files/upload')) {
        uploadCount++;
        assert.match(JSON.parse(new Headers(init?.headers).get('Dropbox-API-Arg')!).path, /^\/[a-f0-9]{64}\.png$/);
        return Response.json({ id: 'id' });
      }
      if (target.endsWith('/sharing/create_shared_link_with_settings')) return conflict ? Response.json({ error: { '.tag': 'shared_link_already_exists' } }, { status: 409 }) : Response.json({ url: 'https://www.dropbox.com/scl/fi/id/art.png?rlkey=key&dl=0', link_permissions: { resolved_visibility: { '.tag': 'public' } } });
      if (target.endsWith('/sharing/list_shared_links')) return Response.json({ links: [{ url: 'https://www.dropbox.com/scl/fi/id/art.png?rlkey=key&dl=0', link_permissions: { resolved_visibility: { '.tag': 'public' } } }] });
      throw new Error('Unexpected request');
    };
    const first = await uploadDropbox(image);
    assert.equal(new URL(first).hostname, 'dl.dropboxusercontent.com');
    conflict = true;
    assert.equal(await uploadDropbox(image), first);
    assert.equal(refreshes, 1); assert.equal(uploadCount, 2);
  } finally { globalThis.fetch = originalFetch; process.env = env; await rm(dir, { recursive: true, force: true }); }
});
