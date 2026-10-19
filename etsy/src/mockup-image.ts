import sharp from "sharp";
import { fileURLToPath } from "node:url";

/** Keeps the entire Gelato image, including white border and baked-in shadow. */
export async function createMainMockup(input: string, output: string, digital: boolean) {
  const source = await sharp(input).rotate().flatten({ background: "white" }).toBuffer();
  const meta = await sharp(source).metadata();
  const ratio = meta.width! / meta.height!;
  const height = Math.max(1, Math.round(Math.min(1910, 2030 / ratio)));
  const width = Math.max(1, Math.round(height * ratio));
  const rim = 46;
  const left = Math.round((2400 - width) / 2);
  // Bottom edge rests on the floor, rather than floating in the middle of the wall.
  const top = 2090 - rim - height;
  const art = await sharp(source).resize(width, height, { fit: "fill" }).toBuffer();
  const x = left - rim, y = top - rim, w = width + rim * 2, h = height + rim * 2;
  let grain = "";
  for (let i = 4; i < rim; i += 6) grain += `<path d="M${x+i} ${y+i}H${x+w-i}V${y+h-i}H${x+i}Z" fill="none" stroke="#aaa" stroke-opacity="0.045" stroke-width="1"/>`;
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="2400"><defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="23"/></filter></defs><rect x="${x+32}" y="${y+18}" width="${w}" height="${h}" fill="#241e18" opacity="0.35" filter="url(#shadow)"/><rect x="${x+9}" y="${y+5}" width="${w}" height="${h}" fill="#0e0e0f"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#19191a"/><path d="M${x} ${y}H${x+w}L${left+width} ${top}H${left}Z" fill="#343436"/><path d="M${x} ${y}L${left} ${top}V${top+height}L${x} ${y+h}Z" fill="#29292b"/><path d="M${x+w} ${y}V${y+h}L${left+width} ${top+height}V${top}Z" fill="#141416"/>${grain}<rect x="${left-3}" y="${top-3}" width="${width+6}" height="${height+6}" fill="#0a0a0b"/></svg>`);
  const label = digital ? "DIGITAL DOWNLOAD · FRAME NOT INCLUDED" : "ART PRINT · FRAME NOT INCLUDED";
  const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="2400"><rect x="535" y="2240" width="1330" height="90" rx="8" fill="#faf8f2" opacity="0.9"/><text x="1200" y="2297" text-anchor="middle" font-family="sans-serif" font-size="34" letter-spacing="2.5" fill="#554d45">${label}</text></svg>`);
  const backgroundPath = new URL("../assets/mockup-wall-floor.jpg", import.meta.url);
  const background = await sharp(fileURLToPath(backgroundPath)).resize(2400, 2400, { fit: "cover" }).toBuffer();
  await sharp(background).composite([{ input: frame }, { input: art, left, top }, { input: caption }]).jpeg({ quality: 94 }).toFile(output);
}
