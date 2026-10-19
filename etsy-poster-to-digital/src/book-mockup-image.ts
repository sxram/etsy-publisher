import sharp from "sharp";
import { fileURLToPath } from "node:url";

/** Reuses the first listing image as-is; no cover text or illustration is generated. */
export async function createBookMockup(input: string, output: string, digital: boolean) {
  const cover = await sharp(input).rotate().flatten({ background: "white" }).toBuffer();
  const meta = await sharp(cover).metadata();
  const ratio = meta.width! / meta.height!;
  const height = Math.max(1, Math.round(Math.min(1850, 1770 / ratio)));
  const width = Math.max(1, Math.round(height * ratio));
  const left = Math.round((2400 - width - 70) / 2);
  const top = 2080 - height;
  const art = await sharp(cover).resize(width, height, { fit: "fill" }).toBuffer();
  let pages = "";
  for (let i = 8; i < 68; i += 4) pages += `<path d="M${left+width+i} ${top+10+i*0.18}V${top+height-8+i*0.18}" stroke="#b9b4ab" stroke-width="1" opacity="0.5"/>`;
  const book = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="2400"><defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter><linearGradient id="paper"><stop stop-color="#d1cdc4"/><stop offset="0.45" stop-color="#fbf9f3"/><stop offset="1" stop-color="#d8d3c9"/></linearGradient><linearGradient id="binding"><stop stop-color="#000" stop-opacity="0.28"/><stop offset="0.12" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.3" stop-color="#000" stop-opacity="0.1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect x="${left+28}" y="${top+24}" width="${width+70}" height="${height}" fill="#362d25" opacity="0.34" filter="url(#shadow)"/><path d="M${left+width} ${top}L${left+width+70} ${top+24}V${top+height+20}L${left+width} ${top+height}Z" fill="#524c44"/><path d="M${left+width} ${top+8}L${left+width+64} ${top+30}V${top+height+10}L${left+width} ${top+height-5}Z" fill="url(#paper)"/>${pages}</svg>`);
  const finishSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="2400"><rect x="${left}" y="${top}" width="38" height="${height}" fill="url(#binding)"/><defs><linearGradient id="binding"><stop stop-color="#000" stop-opacity="0.3"/><stop offset="0.25" stop-color="#fff" stop-opacity="0.15"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="2"/><rect x="525" y="2240" width="1350" height="90" rx="8" fill="#faf8f2" opacity="0.9"/><text x="1200" y="2297" text-anchor="middle" font-family="sans-serif" font-size="34" letter-spacing="2" fill="#554d45">${digital ? "PRINTABLE COLORING BOOK · DIGITAL DOWNLOAD" : "COLORING BOOK · COVER PREVIEW"}</text></svg>`;
  const background = await sharp(fileURLToPath(new URL("../assets/book-mockup-table.jpg", import.meta.url))).resize(2400,2400,{fit:"cover"}).toBuffer();
  const captionStart = finishSvg.indexOf('<rect x="525"');
  const binding = Buffer.from(finishSvg.slice(0, captionStart) + '</svg>');
  const caption = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="2400">' + finishSvg.slice(captionStart));
  const layer = await sharp({create:{width:2400,height:2400,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:book},{input:art,left,top},{input:binding}]).png().toBuffer();
  // Rotate the complete book and its shadow together without cropping the cover.
  const rotated = await sharp(layer).rotate(-8,{background:{r:0,g:0,b:0,alpha:0}})
    .resize(2400,2400,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  // Enlarge only the book layer; the tabletop and footer retain their size.
  const larger = await sharp(rotated).resize(2760,2760).extract({left:180,top:180,width:2400,height:2400}).png().toBuffer();
  await sharp(background).composite([{input:larger},{input:caption}]).jpeg({quality:94}).toFile(output);
}
