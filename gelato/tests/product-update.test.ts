import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateTarget} from '../src/product-update.js';
test('update binds an existing product to its saved store and listing without creating products',()=>{
 const state={storeId:'s',entries:[{profile:'tshirt',productId:'p',externalId:'123'}]};
 assert.equal(updateTarget(state,'s').productId,'p');
 assert.throws(()=>updateTarget(state,'other'),/Shop/);
 assert.throws(()=>updateTarget({...state,entries:[]},'s'),/Genau/);
 assert.throws(()=>updateTarget({...state,entries:[...state.entries,...state.entries]},'s'),/Genau/);
 assert.throws(()=>updateTarget({...state,entries:[{profile:'tshirt',productId:'p',externalId:null}]},'s'),/Genau/);
});
