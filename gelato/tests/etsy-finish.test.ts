import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EtsyApiClient } from '../src/clients/etsy.js';

test('draft finishing corrects taxonomy and spacing, preserves partners, refuses active listings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'etsy-finish-'));
  try {
    const tokenFile = join(dir, 'token.json');
    await writeFile(tokenFile, JSON.stringify({ access_token:'1.test', refresh_token:'refresh', token_type:'Bearer', expires_in:3600, expiresAt:Date.now()+3600000, shopId:'2', apiKey:'key', scope:'shops_r listings_r listings_w' }));
    let state = 'draft'; let patched = false;
    const fetcher: typeof fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('/users/1/shops')) return Response.json({shop_id:2,user_id:1});
      if (u.endsWith('/sections')) return Response.json({results:[{shop_section_id:9,title:'Kids T-Shirts'}]});
      if (u.endsWith('/production-partners')) return Response.json({results:[{production_partner_id:7,partner_name:'Gelato'}]});
      if (init?.method === 'PATCH') {
        const body = init.body as URLSearchParams;
        assert.equal(body.get('taxonomy_id'),'11170');
        assert.equal(body.get('shop_section_id'),'9');
        assert.equal(body.get('description'),'First.\n\nSecond.');
        assert.equal(body.get('production_partner_ids'),'5,7');
        assert.equal(body.has('state'),false);
        patched = true; return Response.json({});
      }
      return Response.json({shop_id:2,state,taxonomy_id:patched?11170:478,description:patched?'First.\n\nSecond.':'First. Second.',production_partner_ids:[5],shop_section_id:patched?9:null});
    };
    const client = new EtsyApiClient({apiKey:'key',sharedSecret:'secret',shopId:'2',redirectUri:'https://example.com/callback',tokenFile},fetcher);
    assert.equal((await client.finishDraft('3','First.\n\nSecond.',11170,'Kids T-Shirts')).productionPartnerAssigned,true);
    state='active'; patched=false;
    await assert.rejects(client.finishDraft('3','First.',11170),/Entwürfe/);
    assert.equal(patched,false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
