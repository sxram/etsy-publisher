import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export interface ShippingInvocation { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }
export type ShippingRunner = (invocation: ShippingInvocation) => Promise<void>;
const run: ShippingRunner = async invocation => {
  await new Promise<void>((done, reject) => {
    const child = spawn(invocation.executable, invocation.args, { cwd: invocation.cwd, env: invocation.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`Etsy-Versandprüfung fehlgeschlagen (${signal ?? code}). Hinweis oben prüfen; danach gelato:resume erneut ausführen.`)));
  });
};
export async function ensureEtsyShipping(listingId: string, expectedShopId = process.env.ETSY_ENABLED === 'true' ? process.env.ETSY_SHOP_ID?.trim() : undefined, runner: ShippingRunner = run, scriptPath = process.env.ETSY_SHIPPING_SCRIPT?.trim()) {
  if (!/^[1-9]\d*$/.test(listingId)) throw new Error('Ungültige Etsy-ID für die Versandprüfung.');
  if (!scriptPath || !isAbsolute(scriptPath) || basename(scriptPath) !== 'shipping-exclusions.ts') throw new Error('ETSY_SHIPPING_SCRIPT muss auf den absoluten Pfad zu etsy-poster-to-digital/src/shipping-exclusions.ts zeigen. Danach gelato:resume erneut ausführen.');
  const script = resolve(scriptPath);
  const cwd = dirname(dirname(script));
  await access(script);
  await access(join(cwd, 'config/shipping-exclusions.json'));
  const loader = createRequire(join(cwd, 'package.json')).resolve('tsx');
  const env = { ...process.env };
  // Use the helper project's own OAuth credentials and token; never mix both projects' Etsy apps.
  for (const key of Object.keys(env)) if (key.startsWith('ETSY_') || key.startsWith('DOTENV_')) delete env[key];
  env.DOTENV_CONFIG_PATH = join(cwd, '.env');
  const args = ['--import', pathToFileURL(loader).href, script, 'apply', '--confirm', '--listing', listingId];
  if (expectedShopId) {
    if (!/^[1-9]\d*$/.test(expectedShopId)) throw new Error('Ungültige ETSY_SHOP_ID für die Versandprüfung.');
    args.push('--expected-shop', expectedShopId);
  }
  console.log(`Etsy-Artikel ${listingId}: Versand-Länderausschlüsse über den Etsy-Zugang in ${cwd} prüfen …`);
  await runner({ executable: process.execPath, args, cwd, env });
}
