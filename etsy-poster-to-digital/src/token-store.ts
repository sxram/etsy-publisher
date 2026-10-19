import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { EtsyToken } from "./types.js";

const TOKEN_FILE = new URL("../.etsy-token.json", import.meta.url);

export async function saveToken(token: Omit<EtsyToken, "obtained_at"> | EtsyToken) {
  const value: EtsyToken = {
    ...token,
    obtained_at: "obtained_at" in token ? token.obtained_at : Date.now(),
  };
  await writeFile(TOKEN_FILE, JSON.stringify(value, null, 2), { mode: 0o600 });
}

export async function loadToken(): Promise<EtsyToken | null> {
  if (!existsSync(TOKEN_FILE)) return null;
  return JSON.parse(await readFile(TOKEN_FILE, "utf8")) as EtsyToken;
}
