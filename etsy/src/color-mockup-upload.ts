import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendColorImages } from './color-image-upload.js';
import { etsyFetch, getMyShop, getListing, getListingImages } from './etsy.js';
import { isPhysicalListing } from './gpsr-text.js';
import type { EtsyListingImage } from './types.js';
export async function runColorUpload(args = process.argv.slice(2)) {
 const option = (name: string) => { const i=args.indexOf(name); const value=args[i+1]; if(i<0 || !value || value.startsWith('--')) throw new Error(`${name} fehlt.`);return value; };
 const id = option('--listing'); if(!/^[1-9]\d*$/.test(id)) throw new Error('Ungültige Artikel-ID.');
 const listingId = Number(id), reportFile = resolve(option('--report'));
 const shop = await getMyShop(); const before = await getListing(listingId);
 if(before.shop_id!==shop.shop_id || !isPhysicalListing(before) || !['active','draft'].includes(before.state)) throw new Error('Nur eigene physische Artikel im Status active/draft dürfen Farbübersichten erhalten.');
 const partners=(before as unknown as {production_partners?:{partner_name:string}[]}).production_partners;
 if(!partners?.some(p=>p.partner_name.trim().toLowerCase()==='gelato')) throw new Error('Gelato ist nicht als Produktionspartner bestätigt.');
 const assertListing = async () => { const now=await getListing(listingId);if(now.shop_id!==shop.shop_id || now.state!==before.state || !isPhysicalListing(now)) throw new Error('Artikelstatus zwischenzeitlich geändert.'); };
 const result=await appendColorImages(reportFile,shop.shop_id,listingId,{
  list:()=>getListingImages(shop.shop_id,listingId),
  upload:async(bytes,rank,alt,overwrite)=>{await assertListing();const form=new FormData();form.append('image',new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}),'color-overview.jpg');form.append('rank',String(rank));form.append('overwrite',overwrite?'true':'false');form.append('alt_text',alt);return etsyFetch<EtsyListingImage>(`/application/shops/${shop.shop_id}/listings/${listingId}/images`,{method:'POST',body:form});},
 },args.includes('--apply'),args.includes('--refresh-managed'));
 await assertListing(); return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runColorUpload().catch(error=>{console.error(error instanceof Error?error.message:'Mockup-Upload fehlgeschlagen.');process.exitCode=1;});
