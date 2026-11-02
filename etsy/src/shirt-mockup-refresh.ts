import 'dotenv/config';
import { readFile, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { etsyFetch, getListing, getListingImages, getMyShop } from './etsy.js';
import { isPhysicalListing } from './gpsr-text.js';
import type { EtsyListingImage } from './types.js';
interface Link { property_id:number;value_id:number;value:string;image_id:number }
interface Entry { oldId:number;rank:number;color:string;file:string;sha256:string;action:'keep'|'replace'|'remove-duplicate';newId?:number;pending?:boolean;removed?:boolean }
interface Plan { listingId:number;shopId:number;state:string;baseline:{id:number;rank:number}[];links:Link[];entries:Entry[];verified?:boolean }
export function colorLinks(links:Link[], entries:Entry[]) {
 const output=new Map<string,{property_id:number;value_id:number;image_id:number}>();
 for(const link of links){const entry=entries.find(e=>e.oldId===link.image_id);if(!entry)throw new Error('Unmapped color image.');
  const target=entry.action==='remove-duplicate'?entries.find(e=>e.color===entry.color&&e.action==='keep'):entry;
  if(!target)throw new Error('No replacement for duplicate.');
  const image_id=target.newId??target.oldId,key=`${link.property_id}:${link.value_id}`;
  // A color may have several historical photo links; Etsy accepts one per value.
  if(!output.has(key))output.set(key,{property_id:link.property_id,value_id:link.value_id,image_id});
 }
 return [...output.values()];
}
async function main(){
 const args=process.argv.slice(2),index=args.indexOf('--plan');if(index<0||!args[index+1])throw new Error('Use --plan FILE [--apply --reviewed]');
 const file=resolve(args[index+1]), plan=JSON.parse(await readFile(file,'utf8')) as Plan;
 if(!args.includes('--apply')){console.log(JSON.stringify({listing:plan.listingId,replace:plan.entries.filter(e=>e.action==='replace').length,keep:plan.entries.filter(e=>e.action==='keep').length}));return;}
 if(!args.includes('--reviewed'))throw new Error('Inspect full-format previews before --reviewed.');
 const lock=await open(file+'.lock','wx');
 const save=()=>writeFile(file,JSON.stringify(plan,null,2)+'\n');
 try{
 const shop=await getMyShop();let listing=await getListing(plan.listingId);
 if(shop.shop_id!==plan.shopId||listing.shop_id!==plan.shopId||listing.state!==plan.state||!isPhysicalListing(listing))throw new Error('Listing identity/state changed.');
 const originalListing=JSON.parse(await readFile(resolve(dirname(file),'listing-before.json'),'utf8'));
 const stable=['title','description','tags','state','shop_section_id','taxonomy_id','price','quantity'];
 const assertMetadata=async()=>{listing=await getListing(plan.listingId);for(const k of stable)if(JSON.stringify((listing as any)[k])!==JSON.stringify(originalListing[k]))throw new Error(`Listing ${k} changed; stopping.`);};
 const base=`/application/shops/${plan.shopId}/listings/${plan.listingId}`;
 const checkGallery=async()=>{const images=await getListingImages(plan.shopId,plan.listingId);const expected=plan.entries.filter(e=>!e.removed).map(e=>e.newId??e.oldId);if(images.length!==expected.length||expected.some(id=>!images.some(i=>i.listing_image_id===id)))throw new Error('Gallery differs from journal; no blind retry.');return images;};
 const linkImages=async()=>{const desired=colorLinks(plan.links,plan.entries);await etsyFetch(base+'/variation-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variation_images:desired})});const got=await etsyFetch<{results:Link[]}>(base+'/variation-images');if(desired.some(d=>!got.results.some(g=>g.property_id===d.property_id&&g.value_id===d.value_id&&g.image_id===d.image_id)))throw new Error('Color links not verified.');};
 for(const e of plan.entries){
  if(e.action==='keep'||e.newId||e.removed)continue;
  if(e.pending)throw new Error('Uncertain previous write: inspect gallery and reconcile before continuing.');
  await assertMetadata();const images=await checkGallery();const old=images.find(i=>i.listing_image_id===e.oldId);
  if(!old)throw new Error('Original image missing.');
  if(e.action==='remove-duplicate'){
   const keep=plan.entries.find(k=>k.color===e.color&&k.action==='keep');if(!keep||!images.some(i=>i.listing_image_id===keep.oldId))throw new Error('No retained complete image.');
   e.pending=true;await save();await etsyFetch(base+'/images/'+e.oldId,{method:'DELETE'});e.removed=true;e.pending=false;await save();await checkGallery();await linkImages();continue;
  }
  const bytes=await readFile(e.file);if(createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw new Error('Reviewed file changed.');
  if(images.filter(i=>i.rank===old.rank).length!==1)throw new Error('Ambiguous rank; no overwrite.');
  const marker=`[giggle-shirt:${e.sha256.slice(0,24)}:${e.oldId}]`;
  const body=new FormData();body.append('image',new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}),'shirt-mockup.jpg');body.append('rank',String(old.rank));body.append('overwrite','true');body.append('alt_text',`Complete shirt design on ${e.color} Gildan 5000B. ${marker}`);
  e.pending=true;await save();let result:EtsyListingImage;
  try{result=await etsyFetch<EtsyListingImage>(base+'/images',{method:'POST',body});}catch(error){const now=await getListingImages(plan.shopId,plan.listingId);const found=now.filter(i=>i.alt_text?.includes(marker));if(found.length!==1)throw error;result=found[0];}
  e.newId=result.listing_image_id;await save();await checkGallery();e.pending=false;await save();await linkImages();console.log(`${plan.listingId}: rank ${old.rank} ${e.color} replaced`);
 }
 await assertMetadata();const final=await checkGallery();await linkImages();await writeFile(resolve(dirname(file),'images-after.json'),JSON.stringify(final,null,2));plan.verified=true;await save();console.log(`${plan.listingId}: images and color links verified; listing metadata unchanged.`);
 }finally{await lock.close();await unlink(file+'.lock');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
