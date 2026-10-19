import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";
import { config, API_BASE } from "./config.js";
import { saveToken } from "./token-store.js";
import type { EtsyToken } from "./types.js";

function base64url(buf: Buffer) {
  return buf.toString("base64url");
}

function challenge(verifier: string) {
  return base64url(createHash("sha256").update(verifier).digest());
}

export async function authenticate(): Promise<void> {
  const verifier = base64url(randomBytes(48));
  const codeChallenge = challenge(verifier);
  const state = base64url(randomBytes(24));

  const redirect = new URL(config.redirectUri);
  const port = Number(redirect.port || 80);
  const expectedPath = redirect.pathname;

  const authUrl = new URL("https://www.etsy.com/oauth/connect");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.apiKey);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("\n1) Open this URL in your browser:\n");
  console.log(authUrl.toString());
  console.log("\n2) Approve access. The local callback will finish the login.\n");

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const incoming = new URL(req.url || "/", `http://localhost:${port}`);

        if (incoming.pathname !== expectedPath) {
          res.writeHead(404).end("Not found");
          return;
        }

        if (incoming.searchParams.get("state") !== state) {
          res.writeHead(400).end("State mismatch");
          throw new Error("OAuth state mismatch.");
        }

        const error = incoming.searchParams.get("error");
        if (error) {
          const desc = incoming.searchParams.get("error_description") || error;
          res.writeHead(400).end(`Etsy authorization failed: ${desc}`);
          throw new Error(desc);
        }

        const code = incoming.searchParams.get("code");
        if (!code) {
          res.writeHead(400).end("Missing authorization code");
          throw new Error("Missing authorization code.");
        }

        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.apiKey,
          redirect_uri: config.redirectUri,
          code,
          code_verifier: verifier,
        });

        const tokenRes = await fetch(`${API_BASE}/public/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        if (!tokenRes.ok) {
          throw new Error(`Token exchange failed ${tokenRes.status}: ${await tokenRes.text()}`);
        }

        const raw = await tokenRes.json() as Omit<EtsyToken, "obtained_at">;
        await saveToken({ ...raw, obtained_at: Date.now() });

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>Etsy login successful.</h2><p>You can close this tab and return to the terminal.</p>");

        console.log("Authentication successful. Token saved locally in .etsy-token.json.");
        server.close(() => resolve());
      } catch (err) {
        server.close(() => reject(err));
      }
    });

    server.listen(port, redirect.hostname, () => {
      console.log(`Listening for Etsy callback on ${config.redirectUri}`);
    });
  });
}
