import sharp from "sharp";
export function validateStyle(text: string, opacity: number) {
  if (!text.trim() || text.length > 80 || /[\x00-\x1f]/.test(text)) throw new Error("Watermark text must contain 1–80 printable characters.");
  if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 0.8) throw new Error("Opacity must be between 0.05 and 0.8.");
}
export async function watermarkImage(input: string, output: string, text: string, opacity: number) {
  validateStyle(text, opacity);
  const base = await sharp(input).rotate().flatten({ background: "white" }).resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).toBuffer();
  const meta = await sharp(base).metadata();
  const w = meta.width!, h = meta.height!;
  // One unobtrusive label horizontally centered in the upper third.
  const size = Math.max(8, Math.min(Math.min(w, h) * 0.06, w * 0.42 / Math.max(1, text.length * 0.65)));
  const escaped = text.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
  const x = w * 0.5, y = h * (1 / 6);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g opacity="${opacity}" transform="rotate(-18 ${x} ${y})"><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-weight="bold" font-size="${size}" fill="white" stroke="#333" stroke-width="${size * 0.025}" paint-order="stroke">${escaped}</text></g></svg>`);
  await sharp(base).composite([{ input: svg }]).jpeg({ quality: 90 }).toFile(output);
}
