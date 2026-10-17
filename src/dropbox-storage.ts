import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

interface Token { appKey: string; access_token: string; refresh_token: string; expires_at: number }
function settings() {
  const appKey = process.env.DROPBOX_APP_KEY?.trim();
  if (!appKey) throw new Error('DROPBOX_APP_KEY fehlt in .env (App key aus der Dropbox App Console).');
  return { appKey, file: resolve(process.env.DROPBOX_TOKEN_FILE?.trim() || '.private/dropbox-tokens.json') };
}
async function tokenRequest(body: URLSearchParams) {
  let response: Response;
  try { response = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body, signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('Dropbox-Anmeldung: Verbindungsfehler.'); }
  if (!response.ok) throw new Error(`Dropbox-Anmeldung: HTTP ${response.status}. App key und Autorisierung prüfen.`);
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!token.access_token || !Number.isFinite(token.expires_in)) throw new Error('Dropbox lieferte keine gültigen Zugangsdaten.');
  return token;
}
async function saveToken(token: Token) {
  const { file } = settings();
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(token), { mode: 0o600, flag: 'wx' });
  await rename(temp, file); await chmod(file, 0o600);
}
async function loadToken(): Promise<Token> {
  const { file, appKey } = settings();
  let token: Token;
  try { token = JSON.parse(await readFile(file, 'utf8')) as Token; }
  catch { throw new Error('Dropbox noch nicht verbunden. Zuerst npm run dropbox:connect ausführen.'); }
  if (token.appKey !== appKey || !token.refresh_token || !token.access_token || !Number.isFinite(token.expires_at)) throw new Error('Dropbox-Zugang passt nicht zur App. npm run dropbox:connect erneut ausführen.');
  return token;
}
export async function validateDropbox() { await loadToken(); }
async function accessToken() {
  const token = await loadToken();
  if (Date.now() < token.expires_at - 120_000) return token.access_token;
  const fresh = await tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: token.appKey }));
  const updated = { ...token, access_token: fresh.access_token, expires_at: Date.now() + fresh.expires_in * 1000 };
  await saveToken(updated);
  return updated.access_token;
}
export function dropboxDownloadUrl(link: string) {
  const url = new URL(link);
  if (url.protocol !== 'https:' || !['www.dropbox.com', 'dropbox.com'].includes(url.hostname)) throw new Error('Unerwarteter Dropbox-Freigabelink.');
  url.hostname = 'dl.dropboxusercontent.com';
  url.searchParams.delete('dl'); url.searchParams.delete('raw');
  return url.toString();
}
export async function uploadDropbox(path: string): Promise<string> {
  const bytes = await readFile(path);
  const filePath = `/${createHash('sha256').update(bytes).digest('hex')}.png`;
  const token = await accessToken();
  const rpc = async (route: string, body: unknown) => {
    try { return await fetch(`https://api.dropboxapi.com/2/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) }); }
    catch { throw new Error('Dropbox-API: Verbindungsfehler.'); }
  };
  let uploaded: Response;
  try { uploaded = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: filePath, mode: 'overwrite', autorename: false, mute: true }) }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(120_000) }); }
  catch { throw new Error('Dropbox-Bild-Upload: Verbindungsfehler.'); }
  if (!uploaded.ok) throw new Error(`Dropbox-Bild-Upload: HTTP ${uploaded.status}. Berechtigung files.content.write und freien Speicher prüfen.`);
  const shared = await rpc('sharing/create_shared_link_with_settings', { path: filePath, settings: { requested_visibility: 'public' } });
  let link: string | undefined;
  if (shared.ok) {
    const result = await shared.json() as { url?: string; link_permissions?: { resolved_visibility?: { '.tag': string } } };
    if (result.link_permissions?.resolved_visibility?.['.tag'] && result.link_permissions.resolved_visibility['.tag'] !== 'public') throw new Error('Dropbox-Link ist nicht öffentlich abrufbar. Freigabeeinstellungen prüfen.');
    link = result.url;
  } else if (shared.status === 409) {
    const conflict = await shared.json() as { error?: { '.tag'?: string } };
    if (conflict.error?.['.tag'] !== 'shared_link_already_exists') throw new Error('Dropbox konnte keinen öffentlichen Freigabelink erstellen. Freigaberichtlinien prüfen.');
    const existing = await rpc('sharing/list_shared_links', { path: filePath, direct_only: true });
    if (!existing.ok) throw new Error(`Dropbox-Freigaben: HTTP ${existing.status}. sharing.read prüfen.`);
    const result = await existing.json() as { links: Array<{ url: string; link_permissions?: { resolved_visibility?: { '.tag': string } } }> };
    link = result.links.find(l => l.link_permissions?.resolved_visibility?.['.tag'] === 'public')?.url;
  } else throw new Error(`Dropbox-Freigabe: HTTP ${shared.status}. sharing.write prüfen.`);
  if (!link) throw new Error('Kein öffentlicher Dropbox-Downloadlink verfügbar.');
  const direct = dropboxDownloadUrl(link);
  let downloaded: Response;
  try { downloaded = await fetch(direct, { redirect: 'error', signal: AbortSignal.timeout(60_000) }); }
  catch { throw new Error('Dropbox-Druckbild ist nicht direkt ohne Weiterleitung abrufbar. Gelato-Aufruf gestoppt.'); }
  if (!downloaded.ok || !downloaded.headers.get('content-type')?.toLowerCase().startsWith('image/png')) throw new Error(`Dropbox-Druckbild liefert keine PNG (HTTP ${downloaded.status}). Gelato-Aufruf gestoppt.`);
  if (!Buffer.from(await downloaded.arrayBuffer()).equals(bytes)) throw new Error('Dropbox-Download stimmt nicht mit der Druckdatei überein. Gelato-Aufruf gestoppt.');
  return direct;
}
export async function connectDropbox() {
  const { appKey } = settings();
  const verifier = randomBytes(48).toString('base64url');
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: appKey, response_type: 'code', token_access_type: 'offline', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), scope: 'files.content.write files.content.read sharing.write sharing.read' }).toString();
  console.log(`Öffne diesen Link im Browser und erlaube den App-Zugriff:\n${url}\nDen anschließend angezeigten Autorisierungscode nur hier im Terminal eingeben.`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let code: string;
  try { code = (await prompt.question('Dropbox-Autorisierungscode: ')).trim(); } finally { prompt.close(); }
  if (!code) throw new Error('Kein Code eingegeben.');
  const token = await tokenRequest(new URLSearchParams({ grant_type: 'authorization_code', client_id: appKey, code, code_verifier: verifier }));
  if (!token.refresh_token) throw new Error('Dropbox hat keinen Refresh-Token geliefert. Anmeldung erneut durchführen.');
  await saveToken({ appKey, access_token: token.access_token, refresh_token: token.refresh_token, expires_at: Date.now() + token.expires_in * 1000 });
  console.log('Dropbox verbunden. Zugangsdaten lokal unter .private gespeichert.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) connectDropbox().catch(error => { console.error(error instanceof Error ? error.message : 'Dropbox-Fehler'); process.exitCode = 1; });
