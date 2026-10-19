import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendDescriptionDefaults, makeProfileTitle, readProductFolder } from './folder-input.js';
import { GelatoApiClient, GelatoHttpError, buildGelatoPayload, completeEtsySizeGrid } from './clients/gelato.js';
import { analyzeArtwork, prepareArtwork, WHITE_PRINT_NOTICE } from './prepare-artwork.js';
import { validateStorage, uploadArtwork } from './artwork-storage.js';
import { ensureEtsyShipping, ensureEtsyManufacturer } from './etsy-shipping.js';
import { ensureProductColorMockups } from './product-color-mockups.js';

interface Profile { colorMockupModel?: string; templateIdEnv: string; placeholder: string; descriptionDefaults?: string[]; titleSuffix?: string; etsyTaxonomyId?: number; etsySection?: string; etsyProductionProcessRequested?: string }
interface Entry { profile: string; templateId: string; placeholder: string; status: string; productId?: string; externalId?: string | null; mockupCheck?: { status: 'pending' | 'verified' | 'waiting_for_etsy'; message?: string }; manufacturerCheck?: { status: 'pending' | 'verified'; message?: string }; shippingCheck?: { status: 'pending' | 'waiting_for_etsy' | 'verified'; checkedAt?: string; message?: string } }
interface State { fingerprint: string; storeId: string; entries: Entry[] }
async function optionalState(path: string): Promise<State | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as State; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export async function runFolder(args = process.argv.slice(2), shippingCheck: (listingId: string) => Promise<void> = ensureEtsyShipping, manufacturerCheck: (listingId: string) => Promise<void> = ensureEtsyManufacturer, mockupCheck: (listingId: string, folder: string, colors: string[]) => Promise<void> = ensureProductColorMockups) {
  const command = args[0];
  if (!['preview', 'create', 'resume'].includes(command ?? '')) throw new Error('Aufruf: npm run gelato:preview|gelato:create|gelato:resume -- --dir ./motiv [--products tshirt]');
  const option = (name: string) => { const index = args.indexOf(name); const value = index >= 0 ? args[index + 1] : undefined; if (index >= 0 && (!value || value.startsWith('--'))) throw new Error(`Wert für ${name} fehlt.`); return value; };
  const folder = option('--dir');
  if (!folder) throw new Error('--dir mit einem Eingabeordner ist erforderlich.');
  const dir = resolve(folder);
  const input = await readProductFolder(dir);
  const artwork = await analyzeArtwork(input.image);
  const profiles = JSON.parse(await readFile(resolve('config/gelato-products.json'), 'utf8')) as Record<string, Profile>;
  const selected = [...new Set((option('--products') || 'tshirt').split(',').map(x => x.trim()).filter(Boolean))];
  if (!selected.length) throw new Error('Mindestens ein Produktprofil erforderlich.');
  const entries: Entry[] = selected.map(name => {
    const p = profiles[name];
    if (!p?.templateIdEnv || !p.placeholder) throw new Error(`Produktprofil ${name} fehlt oder ist unvollständig.`);
    return { profile: name, templateId: process.env[p.templateIdEnv]?.trim() || '', placeholder: p.placeholder, status: 'planned' };
  });
  const metadataFor = (profile: string) => ({ ...input.metadata, title: makeProfileTitle(input.metadata.title, profiles[profile]!.titleSuffix), description: appendDescriptionDefaults(input.metadata.description, [...(profiles[profile]!.descriptionDefaults ?? []), ...(!artwork.rectangular ? [WHITE_PRINT_NOTICE] : [])]) });
  const out = join(dir, 'out', 'gelato');
  await mkdir(out, { recursive: true });
  const manualChecks = entries.map(entry => ({
    profile: entry.profile,
    productionProcess: {
      requestedDefault: profiles[entry.profile]!.etsyProductionProcessRequested ?? null,
      status: 'manual-review-required',
      apiSupported: false,
      note: 'Etsy bietet dieses Feld nicht in der öffentlichen API. Vor manueller Auswahl prüfen: Gelato bedruckt ein fertiges Basisshirt; Shop-Design und Produktionspartner korrekt angeben.',
    },
    returnPolicy: { status: 'manual-review-required', documents: 'docs/shop-policies/', note: '30-Tage-Rückgabe und Rechtstexte im Etsy-Shop hinterlegen; keine automatische Veröffentlichung.' },
    shipping: { status: 'automatic-check-pending', note: 'Nach Gelato-Übertragung zu Etsy werden die Versand-Länderausschlüsse automatisch geprüft. Bei noch fehlender Etsy-ID oder Fehlern mit gelato:resume fortsetzen; nicht ungeprüft veröffentlichen.' },
    gpsr: { status: 'manufacturer-description-check-pending', note: 'Herstellerdaten werden nach Etsy-Übertragung automatisch in der Beschreibung ergänzt. Separate GPSR-Editorfelder werden nicht per API gesetzt. Produktsicherheit bleibt manuell zu prüfen.' },
  }));
  await writeFile(join(out, 'etsy-manual-checks.json'), JSON.stringify(manualChecks, null, 2) + '\n');
  for (const check of manualChecks) if (check.productionProcess.requestedDefault) console.log(`${check.profile}: Etsy-Herstellungsangabe manuell prüfen: "${check.productionProcess.requestedDefault}". Nicht per API gesetzt. Details: ${join(out, 'etsy-manual-checks.json')}`);

  const preparedImage = join(out, 'artwork-prepared.png');
  const statePath = join(out, 'state.json');
  const storeId = process.env.GELATO_STORE_ID?.trim() || '';
  const fingerprint = createHash('sha256').update(input.bytes).update(JSON.stringify({ metadata: input.metadata, artworkProcessing: 'all-colors-no-crop-white-notice-long3800-max10mb-v9', storeId, entries: entries.map(({ profile, templateId, placeholder }) => ({ profile, templateId, placeholder, title: metadataFor(profile).title, description: metadataFor(profile).description })) })).digest('hex');
  const previous = await optionalState(statePath);
  if (command === 'preview') {
    Object.assign(artwork, await prepareArtwork(input.image, preparedImage));
    const plan = { ...input.metadata, image: preparedImage, originalImage: input.image, artwork, profiles: entries.map(entry => ({ ...entry, title: metadataFor(entry.profile).title, description: metadataFor(entry.profile).description })), visibility: 'hidden / Etsy draft requested', missingConfiguration: [...(!storeId ? ['GELATO_STORE_ID'] : []), ...entries.filter(e => !e.templateId).map(e => profiles[e.profile]!.templateIdEnv)] };
    await writeFile(join(out, 'preview.json'), JSON.stringify(plan, null, 2) + '\n');
    console.log(JSON.stringify(plan, null, 2));
    console.log('Nur lokale Vorschau. Kein Gelato-Produkt angelegt.');
    return;
  }
  if (command === 'create' && previous) throw new Error('Ein früherer Auftrag ist gespeichert. gelato:resume verwenden; keine doppelte Erstellung.');
  if (command === 'resume' && !previous) throw new Error('Kein Auftrag zum Fortsetzen gefunden.');
  if (previous && (previous.fingerprint !== fingerprint || previous.storeId !== storeId)) throw new Error('Eingabe oder Konfiguration seit Erstellung geändert. Bestehenden Auftrag zuerst prüfen.');
  const missing = [...(!storeId ? ['GELATO_STORE_ID'] : []), ...entries.filter(e => !e.templateId).map(e => profiles[e.profile]!.templateIdEnv)];
  if (missing.length) throw new Error(`Fehlende Einstellung(en) in .env: ${missing.join(', ')}. Die Template-ID findest du in Gelato unter Vorlagen/Templates.`);
  const client = new GelatoApiClient(process.env.GELATO_API_KEY?.trim() || '', storeId);
  const state = previous ?? { fingerprint, storeId, entries };
  const save = async () => { await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2) + '\n'); await rename(`${statePath}.tmp`, statePath); };
  // A lost POST response cannot safely be retried; reconcile with the dashboard first.
  if (state.entries.some(e => e.status === 'creating' && !e.productId)) throw new Error('Ungewisser früherer Erstellungsversuch. Gelato/Etsy prüfen, bevor erneut erstellt wird.');
  const pending = state.entries.filter(e => !e.productId);
  const templates = new Map<string, Awaited<ReturnType<GelatoApiClient['getTemplate']>>>();
  if (pending.length) {
    console.log("Speicherzugang und Gelato-Vorlage prüfen …");
    await validateStorage();
    for (const entry of pending) {
      const selection = completeEtsySizeGrid(await client.getTemplate(entry.templateId));
      const template = selection.template;
      if (selection.removedSizes.length) console.log(`Alle Vorlagenfarben bleiben erhalten. Nicht in allen Farben verfügbare Größen entfallen: ${selection.removedSizes.join(', ')}. ${template.variants.length} vollständige Kombinationen.`);
      if (template.id !== entry.templateId) throw new Error('Gelato hat eine unerwartete Vorlage zurückgegeben.');
      buildGelatoPayload(template, metadataFor(entry.profile), 'https://example.invalid/preflight.png', entry.placeholder);
      templates.set(entry.profile, template);
    }
  }
  // Exclusive lock blocks simultaneous creates and resumes, including during uploads.
  const { open, unlink } = await import('node:fs/promises');
  const lockPath = join(out, 'operation.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error(`Auftrag läuft bereits oder wurde abgebrochen. ${lockPath} erst nach Prüfung entfernen.`); });
  try {
    const latest = await optionalState(statePath);
    if (JSON.stringify(latest) !== JSON.stringify(previous)) throw new Error('Auftragsstatus inzwischen geändert. Erneut aufrufen.');
    if (pending.length) {
      console.log("Druckbild vorbereiten und komprimieren …");
      await prepareArtwork(input.image, preparedImage);
      console.log("Bild zum konfigurierten Speicher hochladen und Downloadlink erzeugen …");
    }
    const artworkUrl = pending.length ? await uploadArtwork(preparedImage) : undefined;
    if (pending.length) console.log("Bild-Upload abgeschlossen.");
    if (!previous) await save();
    for (const entry of state.entries) {
      if (!entry.productId) {
        entry.status = 'creating'; await save();
        console.log(`${entry.profile}: Produkt bei Gelato anlegen (Antwort kann bis zu 120 Sekunden dauern) …`);
        const result = await client.createFromTemplate(buildGelatoPayload(templates.get(entry.profile)!, metadataFor(entry.profile), artworkUrl!, entry.placeholder)).catch(async error => {
          if (error instanceof GelatoHttpError && [400, 401, 403, 404, 422].includes(error.status)) {
            entry.status = 'rejected'; await save();
          }
          throw error;
        });
        if (!result.id) throw new Error('Gelato-Antwort ohne Produkt-ID. Auftrag im Dashboard prüfen.');
        entry.productId = result.id; entry.status = result.status; entry.externalId = result.externalId; await save();
      }
      console.log(`${entry.profile}: Status für Gelato-Produkt ${entry.productId} abrufen …`);
      const product = await client.getProduct(entry.productId);
      entry.status = product.status; entry.externalId = product.externalId; await save();
      console.log(`${entry.profile}: Gelato-ID ${entry.productId}, Status ${entry.status}, Shop-ID ${entry.externalId ?? 'noch ausstehend'}`);
      if (entry.externalId && profiles[entry.profile]!.etsyTaxonomyId) {
        try {
          if (process.env.ETSY_ENABLED !== 'true') throw new Error('ETSY_ENABLED=true und Etsy-Anmeldung erforderlich.');
          const { loadConfig } = await import('./config.js');
          const { EtsyApiClient } = await import('./clients/etsy.js');
          const config = loadConfig();
          if (!config.etsy) throw new Error('Etsy-Zugang fehlt.');
          const result = await new EtsyApiClient(config.etsy).finishDraft(String(entry.externalId), metadataFor(entry.profile).description, profiles[entry.profile]!.etsyTaxonomyId!, profiles[entry.profile]!.etsySection);
          console.log(`Etsy-Entwurf ${entry.externalId}: Kinderkategorie, Shop-Abteilung und Absätze korrigiert.`);
          if (!result.productionPartnerAssigned) console.log('Offen: Gelato einmalig als Produktionspartner im Etsy-Shop anlegen; eindeutige Zuordnung war nicht möglich.');
        } catch (error) {
          console.log(`Etsy-Nachbearbeitung offen: ${error instanceof Error ? error.message : 'Fehler'}. Nach Behebung gelato:resume erneut ausführen.`);
        }
        console.log('Im Etsy-Editor noch prüfen: Wie stellt dein Shop diesen Artikel her? sowie GPSR-Hersteller/Sicherheitsinformationen.');
      }
      if (entry.externalId && entry.status === 'active') {
        entry.manufacturerCheck = { status: 'pending' }; await save();
        try {
          await manufacturerCheck(String(entry.externalId));
          entry.manufacturerCheck = { status: 'verified' };
          console.log('GPSR-Herstellerkontakt in Etsy-Beschreibung bestätigt. Separate GPSR-Felder und Produktsicherheit manuell prüfen.');
        } catch (error) {
          entry.manufacturerCheck = { status: 'pending', message: error instanceof Error ? error.message : 'GPSR-Fehler' };
          console.error(`GPSR-HERSTELLERANGABEN OFFEN: ${entry.manufacturerCheck.message}. Mit gelato:resume erneut versuchen.`);
        }
        await save();
      }
      if (profiles[entry.profile]!.colorMockupModel) {
        entry.mockupCheck = { status: entry.externalId && entry.status === 'active' ? 'pending' : 'waiting_for_etsy' }; await save();
        if (entry.externalId && entry.status === 'active') {
          try {
            if (profiles[entry.profile]!.colorMockupModel !== 'gildan-5000b') throw new Error('Unbekanntes Mockup-Modell.');
            const colorOptions = product.productVariantOptions?.filter(option => /^(color|colour|farbe)$/i.test(option.name.trim()));
            if (!colorOptions || colorOptions.length !== 1 || !colorOptions[0]!.values.length) throw new Error('Gelato liefert keine eindeutige Farbauswahl. Keine Farbmockups hochgeladen.');
            await mockupCheck(String(entry.externalId), dir, colorOptions[0]!.values);
            entry.mockupCheck = { status: 'verified' };
            console.log('Etsy-Farbübersichten ergänzt bzw. bereits vorhanden. Ursprüngliche Mockups bleiben erhalten.');
          } catch (error) {
            entry.mockupCheck = { status: 'pending', message: error instanceof Error ? error.message : 'Mockup-Fehler' };
            console.error(`FARBMOCKUPS OFFEN: ${entry.mockupCheck.message}. Mit gelato:resume fortsetzen.`);
          }
          await save();
        } else console.log('Farbmockups warten auf die fertige Etsy-Übertragung. Mit gelato:resume fortsetzen.');
      }
      // Separate from draft finishing: shipping must also be checked when a listing is already active,
      // or when the optional category/description finishing step cannot run.
      const shippingReady = !!entry.externalId && entry.status === 'active';
      entry.shippingCheck = { status: shippingReady ? 'pending' : 'waiting_for_etsy' };
      await save();
      if (shippingReady) {
        console.log(`${entry.profile}: Nachträglicher Etsy-Zugriff für Versand-Länderausschlüsse …`);
        try {
          await shippingCheck(String(entry.externalId));
          entry.shippingCheck = { status: 'verified', checkedAt: new Date().toISOString() };
          console.log(`${entry.profile}: Etsy-Versand-Länderausschlüsse geprüft und bei Bedarf angewendet.`);
        } catch (error) {
          entry.shippingCheck = { status: 'pending', message: error instanceof Error ? error.message : 'Etsy-Versandprüfung fehlgeschlagen.' };
          console.error(`${entry.profile}: VERSANDPRÜFUNG OFFEN: ${entry.shippingCheck.message}`);
          console.error('Artikel noch nicht veröffentlichen. Nach Behebung denselben gelato:resume-Befehl erneut ausführen. Kein neues Gelato-Produkt erstellen.');
        }
      } else {
        console.log(`${entry.profile}: Versandprüfung wartet auf die fertige Etsy-Übertragung (Gelato-Status ${entry.status}, Etsy-ID ${entry.externalId ?? 'ausstehend'}). Nach Übertragung gelato:resume erneut ausführen; Artikel vorher nicht veröffentlichen.`);
      }
      await save();
      if (entry.status === 'publishing_error') throw new Error('Gelato meldet einen Übertragungsfehler. Details im Dashboard prüfen.');
    }
    const shippingPending = state.entries.some(e => e.shippingCheck?.status !== 'verified');
    const manufacturerPending = state.entries.some(e => e.manufacturerCheck?.status !== 'verified');
    if (manufacturerPending) console.error('Noch offen: GPSR-Herstellerkontakt nicht bestätigt. Mit gelato:resume fortsetzen.');
    console.log(shippingPending ? 'Noch nicht fertig: Etsy-Versandprüfung offen. Mit gelato:resume fortsetzen.' : 'Etsy-Versandprüfung abgeschlossen. Weitere manuelle Etsy-Angaben und Entwurfsstatus im Shop prüfen.');
    const mockupsPending = state.entries.some(e => !!profiles[e.profile]!.colorMockupModel && e.mockupCheck?.status !== 'verified');
    if (mockupsPending) console.error('Noch offen: Etsy-Farbübersichten. Mit gelato:resume fortsetzen.');
    return { shippingPending, manufacturerPending, mockupsPending };
  } finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runFolder().then(result => { if (result?.shippingPending || result?.manufacturerPending || result?.mockupsPending) process.exitCode = 1; }).catch(error => { console.error(error instanceof Error ? error.message : 'Fehler'); process.exitCode = 1; });
