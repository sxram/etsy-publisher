import {test} from 'node:test';import assert from 'node:assert/strict';import {colorLinks} from './shirt-mockup-refresh.js';
test('remaps image IDs and deduplicates a color without losing another value',()=>{
 const links=[{property_id:513,value_id:1,value:'White',image_id:10},{property_id:513,value_id:1,value:'White',image_id:11},{property_id:513,value_id:2,value:'Navy',image_id:12}];
 const entries:any=[{oldId:10,color:'White',action:'remove-duplicate'},{oldId:11,color:'White',action:'keep'},{oldId:12,color:'Navy',action:'replace',newId:20}];
 assert.deepEqual(colorLinks(links,entries),[{property_id:513,value_id:1,image_id:11},{property_id:513,value_id:2,image_id:20}]);
 assert.throws(()=>colorLinks(links,entries.slice(0,2)),/Unmapped/);
});
