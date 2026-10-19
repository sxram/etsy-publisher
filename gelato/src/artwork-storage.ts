import { uploadDropbox, validateDropbox } from './dropbox-storage.js';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function storageConfig(env = process.env) {
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) throw new Error(`${key} fehlt für den Bild-Upload.`); return value; };
  const endpoint = new URL(required('GELATO_S3_ENDPOINT'));
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('GELATO_S3_ENDPOINT muss eine HTTPS-Adresse ohne Zugangsdaten oder Query sein.');
  return { endpoint, bucket: required('GELATO_S3_BUCKET'), region: env.GELATO_S3_REGION?.trim() || 'auto', accessKey: required('GELATO_S3_ACCESS_KEY_ID'), secret: required('GELATO_S3_SECRET_ACCESS_KEY'), session: env.GELATO_S3_SESSION_TOKEN?.trim() };
}
export function signStorageUrl(config: ReturnType<typeof storageConfig>, method: 'PUT' | 'GET', key: string, now = new Date()) {
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const url = new URL(config.endpoint);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encode(config.bucket)}/${key.split('/').map(encode).join('/')}`;
  const params: Record<string, string> = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${config.accessKey}/${scope}`, 'X-Amz-Date': date, 'X-Amz-Expires': method === 'GET' ? '604800' : '900', 'X-Amz-SignedHeaders': 'host' };
  if (config.session) params['X-Amz-Security-Token'] = config.session;
  const query = Object.keys(params).sort().map(k => `${encode(k)}=${encode(params[k]!)}`).join('&');
  const canonical = `${method}\n${url.pathname}\n${query}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secret}`, day), config.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).digest('hex');
  url.search = `${query}&X-Amz-Signature=${signature}`;
  return url.toString();
}
export async function validateStorage() {
  const provider = process.env.GELATO_STORAGE_PROVIDER?.trim() || 's3';
  if (provider === 'dropbox') await validateDropbox();
  else if (provider === 's3') storageConfig();
  else throw new Error('GELATO_STORAGE_PROVIDER muss s3 oder dropbox sein.');
}
export async function uploadArtwork(path: string) {
  await validateStorage();
  if (process.env.GELATO_STORAGE_PROVIDER?.trim() === 'dropbox') return uploadDropbox(path);
  const config = storageConfig();
  const bytes = await readFile(path);
  const key = `giggle-publisher/${hash(bytes)}${extname(path).toLowerCase()}`;
  let response: Response;
  try { response = await fetch(signStorageUrl(config, 'PUT', key), { method: 'PUT', body: new Uint8Array(bytes), signal: AbortSignal.timeout(120_000) }); }
  catch { throw new Error('Bild-Upload: Verbindungsfehler zum konfigurierten Speicher.'); }
  if (!response.ok) throw new Error(`Bild-Upload: Speicher antwortet mit HTTP ${response.status}.`);
  return signStorageUrl(config, 'GET', key);
}
