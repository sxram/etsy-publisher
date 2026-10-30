import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureEtsyShipping, ensureEtsyDescription, type ShippingInvocation } from '../src/etsy-shipping.js';

test('shipping bridge scopes one listing and uses helper credentials instead of parent Etsy app', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shipping-bridge-'));
  const oldEnv = { ...process.env };
  try {
    await mkdir(join(root, 'src')); await mkdir(join(root, 'config')); await mkdir(join(root, 'node_modules/tsx'), { recursive: true });
    const script = join(root, 'src/shipping-exclusions.ts');
    await writeFile(script, ''); await writeFile(join(root, 'config/shipping-exclusions.json'), '{}'); await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'node_modules/tsx/package.json'), JSON.stringify({ name: 'tsx', exports: './loader.mjs' })); await writeFile(join(root, 'node_modules/tsx/loader.mjs'), '');
    process.env.ETSY_API_KEY = 'parent-app';
    let invocation: ShippingInvocation | undefined;
    await ensureEtsyShipping('123', '456', async value => { invocation = value; }, script);
    assert.ok(invocation); assert.equal(invocation.cwd, root);
    assert.deepEqual(invocation.args.slice(2), [script, 'apply', '--confirm', '--listing', '123', '--expected-shop', '456']);
    assert.equal(invocation.env.ETSY_API_KEY, undefined);
    assert.equal(invocation.env.DOTENV_CONFIG_PATH, join(root, '.env'));
    process.env.ETSY_ENABLED = 'false'; process.env.ETSY_SHOP_ID = 'unused-placeholder';
    await ensureEtsyShipping('123', undefined, async value => { invocation = value; }, script);
    assert.equal(invocation.args.includes('--expected-shop'), false);

    await assert.rejects(ensureEtsyShipping('123', '456', async () => { throw new Error('child failed'); }, script), /child failed/);
  } finally { process.env = oldEnv; await rm(root, { recursive: true, force: true }); }
});
test('shipping bridge rejects missing path, wrong script and invalid Etsy IDs before execution', async () => {
  let runs = 0; const runner = async () => { runs++; };
  await assert.rejects(ensureEtsyShipping('123', undefined, runner, ''), /ETSY_SHIPPING_SCRIPT/);
  await assert.rejects(ensureEtsyShipping('123', undefined, runner, '/tmp/other.ts'), /ETSY_SHIPPING_SCRIPT/);
  await assert.rejects(ensureEtsyShipping('bad', undefined, runner, '/tmp/shipping-exclusions.ts'), /Ungültige Etsy-ID/);
  assert.equal(runs, 0);
});

test('description bridge preserves exact line breaks and tags through the separate Etsy credentials', async () => {
 const root=await mkdtemp(join(tmpdir(),'description-bridge-'));const old={...process.env};
 try {
  await mkdir(join(root,'src'));await mkdir(join(root,'out/gelato'),{recursive:true});await mkdir(join(root,'node_modules/tsx'),{recursive:true});
  await writeFile(join(root,'src/product-description.ts'),'');await writeFile(join(root,'package.json'),'{}');
  await writeFile(join(root,'node_modules/tsx/package.json'),JSON.stringify({name:'tsx',exports:'./loader.mjs'}));await writeFile(join(root,'node_modules/tsx/loader.mjs'),'');
  process.env.ETSY_SHIPPING_SCRIPT=join(root,'src/shipping-exclusions.ts');process.env.ETSY_API_KEY='parent';
  let invoked:ShippingInvocation|undefined;
  const text='First.\n\nSecond.\n- One\n- Two';
  await ensureEtsyDescription('123',root,text,['stiff little fingers','inflammable material'],async call=>{invoked=call;},{section:'Kids T-Shirts',taxonomyId:11170});
  assert.equal(await readFile(join(root,'out/gelato/etsy-description.txt'),'utf8'),text);
  assert.deepEqual(JSON.parse(await readFile(join(root,'out/gelato/etsy-tags.json'),'utf8')),['stiff little fingers','inflammable material']);
  assert.ok(invoked);assert.equal(invoked.env.ETSY_API_KEY,undefined);assert.equal(invoked.env.DOTENV_CONFIG_PATH,join(root,'.env'));
  assert.ok(invoked.args.includes('--section'));assert.ok(invoked.args.includes('--taxonomy'));
  await assert.rejects(ensureEtsyDescription('123',root,text,[],async()=>{throw Error('verification failed');}),/verification failed/);
 } finally {process.env=old;await rm(root,{recursive:true,force:true});}
});
