import sharp from 'sharp';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendDescriptionDefaults, makeProfileTitle, parseProductText } from '../src/folder-input.js';
import { buildGelatoPayload, completeEtsySizeGrid } from '../src/clients/gelato.js';
import { runFolder } from '../src/gelato-folder.js';
import { signStorageUrl } from '../src/artwork-storage.js';

const text = '**Title**\nMoon Fox, Woodland Art\n\n**Tags**\nfox shirt, woodland gift\n\n**Description**\nA whimsical fox design.';
const template = { id: 't1', variants: [{ id: 'v1', imagePlaceholders: [{ name: 'artwork-prepared.png' }] }, { id: 'v2', imagePlaceholders: [{ name: 'artwork-prepared.png' }] }] };
test('metadata accepts inline and Markdown fields without digital product additions', () => {
  const result = parseProductText(text);
  assert.equal(result.title, 'Moon Fox | Woodland Art');
  assert.deepEqual(result.tags, ['fox shirt', 'woodland gift']);
  assert.equal(result.description, 'A whimsical fox design.');
  assert.equal(parseProductText('Title: Moon Fox\nTags: fox shirt\nFox design.').title, 'Moon Fox');
  assert.throws(() => parseProductText('Title: Fox\nNo tags'), /erforderlich/);
  assert.throws(() => parseProductText('Title: Fox\nTags: this tag is much too long to use\nDescription.'), /Tags/);
});
test('template payload includes all variants, hidden visibility and non-cropping artwork', () => {
  const payload = buildGelatoPayload(template, parseProductText(text), 'https://art.example/image.png', 'artwork-prepared.png');
  assert.equal(payload.isVisibleInTheOnlineStore, false);
  assert.equal(payload.variants.length, 2);
  assert.equal(payload.variants[1]?.imagePlaceholders[0]?.fitMethod, 'meet');
  assert.throws(() => buildGelatoPayload({ id: 't', variants: [{ id: 'v', imagePlaceholders: [{ name: 'ImageFront' }, { name: 'ImageBack' }] }] }, parseProductText(text), 'https://example.com/art.png', 'ImageFront'), /Bildplatzhalter/);
});
test('signed storage URLs bind method, bucket, object and expiration', () => {
  const config = { endpoint: new URL('https://s3.example.com'), region: 'eu-central-1', bucket: 'art', accessKey: 'test', secret: 'secret', session: undefined };
  const now = new Date('2026-10-16T00:00:00Z');
  const get = new URL(signStorageUrl(config, 'GET', 'folder/a b.png', now));
  const put = new URL(signStorageUrl(config, 'PUT', 'folder/a b.png', now));
  assert.equal(get.pathname, '/art/folder/a%20b.png');
  assert.equal(get.searchParams.get('X-Amz-Expires'), '604800');
  assert.notEqual(get.searchParams.get('X-Amz-Signature'), put.searchParams.get('X-Amz-Signature'));
});
test('folder create/resume avoids duplicates and lost-response retries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'giggle-flow-'));
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let posts = 0; let fail = false;
  Object.assign(process.env, { GELATO_API_KEY: 'test', GELATO_STORE_ID: 's1', GELATO_TEMPLATE_TSHIRT: 't1', GELATO_S3_ENDPOINT: 'https://storage.example', GELATO_S3_BUCKET: 'art', GELATO_S3_ACCESS_KEY_ID: 'test', GELATO_S3_SECRET_ACCESS_KEY: 'secret' });
  globalThis.fetch = async (url, init) => {
    const address = String(url);
    if (address.includes('/templates/t1')) return Response.json(template);
    if (address.startsWith('https://storage.example/')) {
      const uploaded = await sharp(Buffer.from(init?.body as Uint8Array)).metadata();
      assert.equal(uploaded.format, 'png');
      assert.ok(uploaded.hasAlpha);
      return new Response(null, { status: 200 });
    }
    if (address.endsWith('products:create-from-template')) {
      posts++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.isVisibleInTheOnlineStore, false);
      assert.equal(body.title, 'Moon Fox | Woodland Art | Classic Kids Crewneck T-Shirt | Gildan® 5000B');
      assert.match(body.description, /<p>A whimsical fox design\.<\/p>\n<p>- Soft and comfortable heavyweight fabric/);
      assert.match(body.description, /Available in a wide range of colors/);
      if (fail) throw new TypeError('fetch failed');
      return Response.json({ id: 'p1', status: 'created' });
    }
    if (address.endsWith('/products/p1')) return Response.json({ id: 'p1', status: 'active', externalId: 'e1' });
    throw new Error('Unexpected request');
  };
  try {
    await sharp({ create: { width: 4800, height: 1, channels: 4, background: 'red' } }).png().toFile(join(dir, 'image.png'));
    await writeFile(join(dir, 'description.md'), text);
    await runFolder(['create', '--dir', dir]);
    assert.equal(posts, 1);
    const saved = await readFile(join(dir, 'out/gelato/state.json'), 'utf8');
    assert.ok(!saved.includes('X-Amz'));
    await assert.rejects(runFolder(['create', '--dir', dir]), /doppelte/);
    await runFolder(['resume', '--dir', dir]);
    assert.equal(posts, 1);
    await writeFile(join(dir, 'description.md'), text + ' Changed.');
    await assert.rejects(runFolder(['resume', '--dir', dir]), /geändert/);
    await writeFile(join(dir, 'description.md'), text);
    await rm(join(dir, 'out/gelato/state.json'));
    fail = true;
    await assert.rejects(runFolder(['create', '--dir', dir]), /Verbindungsfehler/);
    assert.equal(posts, 2);
    await assert.rejects(runFolder(['resume', '--dir', dir]), /Ungewisser/);
    assert.equal(posts, 2);
  } finally { globalThis.fetch = originalFetch; process.env = originalEnv; await rm(dir, { recursive: true, force: true }); }
});

test('multiline tags accept plain lines, wrapped comma lists and list items', () => {
  const cases = [
    '**Tags**\nfox shirt\nwoodland gift\nmoon art',
    'Tags: fox shirt,\nwoodland gift, moon art',
    '**Tags**\n- fox shirt\n- woodland gift\n- moon art',
    '**Tags**\n1. fox shirt\n2. woodland gift\n3. moon art',
  ];
  for (const block of cases) {
    const result = parseProductText(`Title: Moon Fox\n\n${block}\n\n**Description**\nA whimsical fox design.`);
    assert.deepEqual(result.tags, ['fox shirt', 'woodland gift', 'moon art']);
    assert.equal(result.description, 'A whimsical fox design.');
  }
  const adjacent = parseProductText('Title: Fox\nTags: fox shirt\nwoodland gift\nDescription:\nA whimsical fox design.');
  assert.deepEqual(adjacent.tags, ['fox shirt', 'woodland gift']);
  assert.equal(adjacent.description, 'A whimsical fox design.');
});

test('description defaults append only missing points and preserve original text', () => {
  const points = ['Soft and comfortable heavyweight fabric', 'Pre-shrunk for consistent fit post-wash'];
  const original = 'My design.\n\n- **Soft and comfortable heavyweight fabric.**';
  const result = appendDescriptionDefaults(original, points);
  assert.equal(result, original + '\n\n- Pre-shrunk for consistent fit post-wash');
  assert.equal(appendDescriptionDefaults(result, points), result);
  assert.equal(appendDescriptionDefaults('My design.'), 'My design.');
});

test('profile title retains motif and model, avoids duplicate suffix and fits Etsy limit', () => {
  const suffix = 'Classic Kids Crewneck T-Shirt | Gildan® 5000B';
  const title = makeProfileTitle('Moon Fox', suffix);
  assert.equal(title, 'Moon Fox | ' + suffix);
  assert.equal(makeProfileTitle(title, suffix), title);
  const long = makeProfileTitle('Dreamy Woodland Fox '.repeat(7).trim(), suffix);
  assert.ok(long.length <= 140);
  assert.ok(long.endsWith('Kids Crewneck T-Shirt | Gildan® 5000B'));
  assert.ok(!long.includes('Classic'));
  assert.equal(makeProfileTitle('Moon Fox'), 'Moon Fox');
  const partial = makeProfileTitle('Moon Fox | Gildan® 5000B', suffix);
  assert.equal(partial.match(/5000B/g)?.length, 1);
});

test('all template variants are retained regardless of color', () => {
  const t = { id: 't', variants: [
    { id: 'white', imagePlaceholders: [{ name: 'ImageFront' }] },
    { id: 'black', imagePlaceholders: [{ name: 'ImageFront' }] },
  ] };
  assert.deepEqual(buildGelatoPayload(t, parseProductText(text), 'https://example.com/art.png', 'ImageFront').variants.map(v => v.templateVariantId), ['white', 'black']);
});

test('Etsy grid keeps all colors and omits sizes absent in some colors', () => {
  const variants = [['White','XS'],['White','S'],['White','M'],['Black','S'],['Black','M']].map(([color,size],i) => ({ id: String(i), variantOptions: [{name:'Color',value:color!},{name:'Size',value:size!}], imagePlaceholders: [] }));
  const selected = completeEtsySizeGrid({ id:'t', variants });
  assert.deepEqual(selected.removedSizes,['XS']); assert.equal(selected.template.variants.length,4);
  assert.equal(completeEtsySizeGrid(selected.template).removedSizes.length,0);
});

test('Gelato descriptions use escaped HTML paragraphs and line breaks', async () => {
  const { toGelatoHtml } = await import('../src/folder-input.js');
  assert.equal(toGelatoHtml('First paragraph.\n\n**Details**\n- Cotton & comfort'), '<p>First paragraph.</p>\n<p><strong>Details</strong><br>- Cotton &amp; comfort</p>');
  assert.equal(toGelatoHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
});
