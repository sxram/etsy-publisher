import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { getMyShop, getListing, etsyFetch } from './etsy.js';
import { isPhysicalListing } from './gpsr-text.js';
import { restorePosterParagraphs } from './poster-description-text.js';
async function main() {
 const args=process.argv.slice(2); const value=(key:string)=>args[args.indexOf(key)+1];
 const id=value('--listing'), file=value('--description');
 if(!args.includes('--listing')||!args.includes('--description')||!id||!/^\d+$/.test(id)||!file)throw new Error('--listing ID --description FILE erforderlich.');
 const shop=await getMyShop(), before=await getListing(Number(id));
 if(before.shop_id!==shop.shop_id||!isPhysicalListing(before)||!['draft','active'].includes(before.state))throw new Error('Eigener physischer Entwurf/aktiver Artikel erforderlich.');
 const description=restorePosterParagraphs(before.description??'',await readFile(resolve(file),'utf8'));
 if(description===before.description){console.log('Poster-Beschreibung: Absatzabstände bereits korrekt.');return;}
 const out=resolve('out/poster-description');await mkdir(out,{recursive:true});
 await writeFile(join(out,`${id}-${Date.now()}.json`),JSON.stringify({listingId:id,state:before.state,description:before.description},null,2));
 const latest=await getListing(Number(id));if(latest.description!==before.description||latest.state!==before.state)throw new Error('Artikel zwischenzeitlich geändert.');
 await etsyFetch(`/application/shops/${shop.shop_id}/listings/${id}`,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({description})});
 const after=await getListing(Number(id));if(after.description!==description||after.state!==before.state)throw new Error('Absatz-Korrektur nicht bestätigt.');
 console.log('Poster-Beschreibung: Leerzeilen wiederhergestellt; Artikelstatus unverändert.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
