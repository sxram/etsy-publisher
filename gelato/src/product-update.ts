import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { GelatoApiClient } from './clients/gelato.js';
import { readProductFolder, appendDescriptionDefaults, makeProfileTitle } from './folder-input.js';
import { prepareProductMockups, type MockupProduct } from './shirt-mockup-selection.js';
import { prepareArtwork } from './prepare-artwork.js';
import { uploadArtwork } from './artwork-storage.js';
import { ensureEtsyDescription } from './etsy-shipping.js';
export function updateTarget(state: {storeId:string;entries:{profile:string;productId?:string;externalId?:string|null}[]}, storeId:string) {
 if(state.storeId!==storeId)throw new Error('Shop stimmt nicht mit gespeichertem Auftrag überein.');
 const entries=state.entries.filter(e=>e.profile==='tshirt');
 if(entries.length!==1||!entries[0]?.productId||!/^[1-9]\d*$/.test(entries[0].externalId??''))throw new Error('Genau ein gespeicherter Shirt-Artikel mit Etsy-ID erforderlich.');
 return entries[0];
}
async function main() {
 const args=process.argv.slice(2), command=args[0];
 if(!['preview','prepare','etsy-metadata','mockup-preview'].includes(command??''))throw new Error('Aufruf: product:update preview|prepare|etsy-metadata|mockup-preview --dir QUELLE --existing-dir BESTEHENDER_AUFTRAG');
 const value=(key:string)=>{const i=args.indexOf(key);if(i<0||!args[i+1]||args[i+1]!.startsWith('--'))throw new Error(key+' fehlt.');return args[i+1]!;};
 const dir=resolve(value('--dir')), existing=resolve(value('--existing-dir'));
 const state=JSON.parse(await readFile(join(existing,'out/gelato/state.json'),'utf8'));
 const storeId=process.env.GELATO_STORE_ID?.trim()??'';const target=updateTarget(state,storeId);
 const input=await readProductFolder(dir);const profiles=JSON.parse(await readFile('config/gelato-products.json','utf8'));const profile=profiles.tshirt;
 const title=makeProfileTitle(input.metadata.title,profile.titleSuffix), description=appendDescriptionDefaults(input.metadata.description,profile.descriptionDefaults);
 const hash=createHash('sha256').update(input.bytes).update(JSON.stringify(input.metadata)).digest('hex');
 const out=join(dir,'out/gelato/update');await mkdir(out,{recursive:true});
 const lock=await open(join(out,'operation.lock'),'wx');
 try {
  const prepared=join(out,'artwork-prepared.png');const artwork=await prepareArtwork(input.image,prepared);
  const identity={productId:target.productId,listingId:target.externalId,sourceHash:hash};
  const plan={...identity,title,tags:input.metadata.tags,description,artwork,gelatoPrintUpdate:'pending-dashboard-csv-import',etsyImagesUpdate:'pending-gelato-mockups',newProductCreated:false};
  await writeFile(join(out,'preview.json'),JSON.stringify(plan,null,2));
  if(command==='preview'){console.log(JSON.stringify(plan,null,2));return;}
  const client=new GelatoApiClient(process.env.GELATO_API_KEY?.trim()??'',storeId);const product=await client.getProduct(target.productId!);
  if(product.id!==target.productId||String(product.externalId)!==target.externalId)throw new Error('Gelato-/Etsy-Zuordnung geändert.');
  if(command==='mockup-preview'){const images=await prepareProductMockups(product as unknown as MockupProduct,join(out,'mockup-preview'));console.log(`${images.length} fresh mockups prepared locally; review before replacing Etsy images. No Gelato or Etsy writes.`);return;}
  const backup=join(out,'gelato-before.json');try{await writeFile(backup,JSON.stringify(product,null,2),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  if(command==='prepare'){
   const fileUrl=await uploadArtwork(prepared);
   await writeFile(join(out,'gelato-print-update.json'),JSON.stringify({...identity,fileUrl,preparedImage:prepared,status:'pending-dashboard-csv-import',instructions:'Export CSV in Gelato > Store > Bulk operations > Update product designs. Retain only this product; replace Print File URLs with fileUrl. Import and verify all variants. No supported public update endpoint is documented.',documentation:'https://support.gelato.com/en/articles/10615769-bulk-update-product-designs-and-mockups'},null,2),{mode:0o600});
   console.log('Druckdatei hochgeladen; vorhandenes Produkt gesichert. Gelato-CSV-Import bleibt offen. Kein Produkt neu angelegt.');
  } else {
   const baseOut=join(dir,'out/gelato');const expected=join(baseOut,'etsy-description-before-edit.txt');
   try {await readFile(expected);} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(expected,await readFile(join(existing,'out/gelato/etsy-description.txt'),'utf8'));}
   await ensureEtsyDescription(target.externalId!,dir,description,input.metadata.tags,undefined,{title,section:profile.etsySection,taxonomyId:profile.etsyTaxonomyId});
   await writeFile(join(out,'etsy-metadata-verified.json'),JSON.stringify({...identity,title,status:'verified',verifiedAt:new Date().toISOString(),gelatoPrintUpdate:'pending-dashboard-csv-import',etsyImagesUpdate:'pending-gelato-mockups'},null,2));
   console.log('Bestehender Etsy-Artikel: Titel, Beschreibung und Tags bestätigt; Status unverändert. Druckdatei und Mockups separat aktualisieren.');
  }
 } finally {await lock.close();await unlink(join(out,'operation.lock'));}
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
