import { spawn } from "node:child_process";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findPosterInput } from "./new-poster.js";
import { validateStyle } from "./watermark-image.js";

type Runner = (script: string, args: string[]) => Promise<void>;
const runScript: Runner = async (script, args) => {
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", join(dirname(fileURLToPath(import.meta.url)), script), ...args], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? done() : reject(new Error(`${script} wurde abgebrochen (${code}). Fehler prüfen und denselben poster:create-Befehl erneut ausführen. Ausgabedateien behalten.`)));
  });
};

export async function processPoster(args: string[], run: Runner = runScript) {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !["--dir", "--opacity", "--text"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error('Aufruf: npm run poster:create -- --dir "./mein-poster" [--text GigglingHome] [--opacity 0.14]');
    options.set(key, value);
  }
  if (!options.get("--dir")) throw new Error("--dir mit dem Eingabeordner ist erforderlich.");
  const text = options.get("--text") || process.env.WATERMARK_TEXT || "GigglingHome";
  const opacity = Number(options.get("--opacity") || process.env.WATERMARK_OPACITY || "0.14");
  validateStyle(text, opacity);
  const dir = resolve(options.get("--dir")!);
  const input = await findPosterInput(dir);
  const output = join(dir, "out", "new-posters", input.stem);
  await mkdir(output, { recursive: true });
  const lockPath = join(output, ".poster-process-lock");
  const lock = await open(lockPath, "wx").catch(() => { throw new Error(`Ein Gesamtlauf ist aktiv oder wurde unterbrochen. ${lockPath} nach einem Absturz erst entfernen, wenn kein Prozess mehr läuft.`); });
  const manifestPath = join(output, "listing.json");
  const readManifest = async (): Promise<{ listingId?: number; etsyStatus?: string }> => {
    try { return JSON.parse(await readFile(manifestPath, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  };
  try {
    let manifest = await readManifest();
    if (!manifest.etsyStatus) {
      console.log("1/3: Druckdatei und Etsy-Entwurf erstellen …");
      await run("new-poster.ts", ["--create", "--dir", dir]);
    } else if (manifest.etsyStatus === "uploading" || manifest.etsyStatus === "creating") {
      console.log("1/3: Vorhandenen Etsy-Entwurf fortsetzen …");
      await run("new-poster.ts", ["--create", "--resume", "--dir", dir]);
    } else if (manifest.etsyStatus !== "needs_ai_disclosure") {
      throw new Error(`Unbekannter Erstellungsstatus ${manifest.etsyStatus}. ${manifestPath} prüfen.`);
    }
    manifest = await readManifest();
    if (manifest.etsyStatus !== "needs_ai_disclosure" || !Number.isSafeInteger(manifest.listingId) || manifest.listingId! <= 0) throw new Error("Kein vollständig vorbereiteter Etsy-Entwurf mit gültiger ID vorhanden. Verarbeitung gestoppt.");
    console.log("2/3 und 3/3: Artikelbilder mit Wasserzeichen versehen, danach Mockup erstellen …");
    await run("process-article.ts", ["--listing", String(manifest.listingId), "--dir", join(output, "processing"), "--text", text, "--opacity", String(opacity)]);
    console.log(`Fertig: https://www.etsy.com/your/shops/me/listing-editor/edit/${manifest.listingId}\nDer Artikel bleibt ein Entwurf. Noch „Mit einem KI-Generator“ auswählen und speichern.\nDruckdatei und Sicherungen: ${output}`);
  } finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  processPoster(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
