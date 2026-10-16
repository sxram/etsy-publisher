# Giggle Publisher

Minimaler TypeScript-/Node.js-Remote-MCP-Server als Grundlage für ein persönliches
ChatGPT-Plugin. Standardmäßig sind `health_check` und `hello` aktiv. Optional kann der eigene Etsy-Shop
lokal per OAuth verbunden werden. Gelato ist über den unten beschriebenen Ordner-Aufruf angebunden; ein OpenAI-API-Key ist nicht nötig.

## Lokal starten

Voraussetzung: Node.js 24 oder neuer und npm.

```sh
cp .env.example .env
npm ci
npm run dev
```

MCP: `http://127.0.0.1:3000/mcp`. Separater HTTP-Liveness-Check:

```sh
curl http://127.0.0.1:3000/healthz
```

Produktionsmodus lokal:

```sh
npm run build
npm start
```

## Testen

```sh
npm run typecheck
npm test
npm run build
# In einem zweiten Terminal, während der Server läuft:
npm run smoke
```

Die Integrationstests starten einen echten HTTP-Server auf einem freien Port und
prüfen MCP-Initialisierung, Tool-Liste, beide Tool-Aufrufe, ungültige Eingaben,
Host-/Origin-Abweisung und HTTP-Fehlerfälle. `smoke` prüft einen laufenden Endpunkt.
Remote-Test: `MCP_URL=https://deine-domain.example/mcp npm run smoke`.

Interaktiv: `npx @modelcontextprotocol/inspector@latest`; Transport „Streamable HTTP“,
URL `http://127.0.0.1:3000/mcp`. Bei direkter Browser-Verbindung muss der tatsächliche
Inspector-Origin in `ALLOWED_ORIGINS` stehen (Standard: Port 6274). Der Inspector
kann auch über seinen eigenen Proxy verbinden.

## Architektur

```text
src/index.ts        Start, Konfiguration, Shutdown
src/http.ts         HTTP-Routing, Host/Origin-Prüfung, MCP-Transport
src/mcp.ts          Server-Fabrik und Tool-Registrierung
src/tools/health.ts Test-Tools mit Zod-Schemas und Read-only-Annotations
src/clients/etsy.ts  Etsy OAuth, Token-Speicherung, Refresh und Shop-Prüfung
scripts/etsy-connect.ts Einmalige interaktive Shop-Freigabe
src/tools/etsy.ts    Lokales Read-only-Tool list_etsy_drafts
src/clients/gelato.ts Gelato-Client und Vorlagen-Erstellung
scripts/smoke.ts    MCP-Client für lokale und Remote-Prüfung
```

Der offizielle SDK-v1-Transport wird zustandslos mit JSON-Antworten betrieben:
pro Request eine frische Server-/Transportinstanz, keine Session-IDs. POST verarbeitet
MCP, OPTIONS Browser-Preflight; GET/DELETE liefern im zustandslosen Modus 405. Kein
Legacy-SSE-Endpunkt. Das SDK übernimmt das MCP-Protokoll und dessen Validierung.
Diese Entscheidung folgt dem aktuellen OpenAI-Quickstart; SDK v1.32.1 ist exakt
gepinnt, alle aufgelösten Abhängigkeiten stehen im Lockfile. SDK-v2-Dokumentation
existiert bereits; ein Wechsel sollte als separate Migration getestet werden.

## HTTPS und Deployment

Node stellt HTTP bereit. Ein Reverse Proxy oder der Hosting-Dienst terminiert TLS
und stellt öffentlich `https://<domain>/mcp` bereit. Das Projekt enthält ein
Dockerfile und eine Docker-Compose-/Caddy-Vorlage für einen Linux-Host mit Docker.

1. Projekt auf den Host kopieren. DNS-A/AAAA-Einträge der eigenen Domain korrekt
   auf den Host setzen; Ports 80 und 443 erreichbar machen.
2. Aus dem Projektverzeichnis starten (Domain ersetzen):

```sh
MCP_DOMAIN=mcp.deine-domain.example docker compose -f deploy/compose.yaml up -d --build
```

3. Caddy bezieht ein TLS-Zertifikat und leitet an den internen Container weiter.
   Port 3000 wird nicht öffentlich veröffentlicht. Danach testen:

```sh
curl https://mcp.deine-domain.example/healthz
MCP_URL=https://mcp.deine-domain.example/mcp npm run smoke
```

Auf einer Container-Plattform alternativ das Dockerfile verwenden, Containerport
3000, `HOST=0.0.0.0`, `PORT=3000` und `ALLOWED_HOSTS=<öffentlicher-host>,127.0.0.1`
setzen. HTTPS-Ingress aktivieren, `/mcp` unverändert weiterleiten und den originalen
Host-Header erhalten. Health-Probe: `/healthz`. TLS-Zertifikate, Rate-Limits und
Request-Größenbegrenzung am Ingress verwalten; Caddy begrenzt den Body auf 1 MB.

Für einen kurzen Entwicklungstest ist auch `ngrok http 3000` möglich. Den Tunnel-
Host vorher zu `ALLOWED_HOSTS` hinzufügen und den Server neu starten. Ein Tunnel
setzt einen laufenden lokalen Rechner voraus; dauerhaftes Hosting nicht.

## Mit ChatGPT verbinden — geprüft am 7. Oktober 2026

Der aktuelle offizielle Weg für diese persönliche Remote-Anbindung:

1. [ChatGPT Plugins](https://chatgpt.com/plugins) öffnen, Plus → **Add custom MCP server**.
2. Name **Giggle Publisher**, öffentliche HTTPS-URL inklusive `/mcp` angeben.
   Für diesen ausschließlich öffentlichen Testserver ohne Benutzer-Authentifizierung verbinden.
3. Den angezeigten Risikohinweis prüfen und **Create as a plugin** wählen.
4. Plugin installieren, neuen Chat öffnen, über `@` auswählen und etwa
   „Rufe health_check auf“ oder „Sag hello zu Stefan“ eingeben.
5. Nach Änderungen an Tools/Schemas die Verbindung auf der Plugin-Detailseite aktualisieren.

Die konkrete Verfügbarkeit im eigenen Konto muss dort geprüft werden. Der frühere
Verweis auf Developer Mode ist nicht die hier dokumentierte aktuelle Route.
Mobile-App-Verfügbarkeit wird durch dieses Projekt nicht belegt; zuerst im
ChatGPT-Web testen. Öffentliches Hosting ist vorbereitet, aber noch nicht erfolgt;
auch eine echte ChatGPT-Verbindung wurde hier nicht getestet.

## Etsy: eigenen Shop verbinden

Die Integration verwendet Etsy Open API v3: `x-api-key: keystring:shared_secret`,
OAuth Authorization Code mit PKCE/S256 und einmaligem State, automatische
Access-Token-Erneuerung und Prüfung des Shop-Eigentümers. Freigegeben werden nur
`shops_r listings_r`. Das Tool `list_etsy_drafts` liest eine Seite mit `limit`
(1–100, Standard 25) und `offset` (Standard 0). Es verändert keine Listings.
`count` ist die von Etsy gemeldete Gesamtzahl; die Ausgabe enthält nur echte Drafts.

1. In [Etsy Your Apps](https://www.etsy.com/developers/your-apps) die App anlegen bzw.
   öffnen und Keystring sowie Shared Secret abrufen. Eine HTTPS-Redirect-URL exakt
   registrieren, beispielsweise eine eigene Callback-Seite. Sie darf keine
   Query-Parameter oder Fragmente enthalten.
2. In der lokalen `.env` `ETSY_ENABLED=true`, `ETSY_API_KEY`, `ETSY_SHARED_SECRET`,
   `ETSY_SHOP_ID` und `ETSY_REDIRECT_URI` setzen. `HOST=127.0.0.1` und ausschließlich
   `localhost,127.0.0.1` in `ALLOWED_HOSTS` beibehalten.
3. `npm run etsy:connect` ausführen. Den ausgegebenen Link im Browser öffnen und
   mit dem Konto des Shop-Eigentümers autorisieren. Anschließend die vollständige
   Redirect-Adresse aus der Adresszeile in den Assistenten kopieren, innerhalb von
   zehn Minuten. Die Callback-Seite muss nicht laden: dieser manuelle Ablauf
   benötigt keinen öffentlich erreichbaren Callback-Server. Die Adresse enthält
   einen kurzlebigen Code und gehört ausschließlich in den lokalen Assistenten.
4. `npm run dev` starten bzw. neu starten. Im lokalen MCP-Client
   `list_etsy_drafts` aufrufen. Ein anderer Shop kann nicht als Tool-Eingabe
   ausgewählt werden. Änderungen an Keystring, Shop oder Scopes erfordern eine
   neue Verbindung.

Tokens werden atomar in `.private/etsy-tokens.json` gespeichert (Dateirechte 0600,
neu angelegtes Verzeichnis 0700), von Git und Docker-Builds ausgeschlossen und
nicht in Tool-Antworten ausgegeben. Die Datei enthält unverschlüsselte Secrets:
Zugriff nur für den betreibenden Benutzer, keine geteilten Backups. Einen einzelnen
Serverprozess mit dieser Datei betreiben; Token-Erneuerungen innerhalb des Prozesses
werden zusammengeführt. Ein anderer Tokenpfad muss ebenfalls aus Versionsverwaltung
und Build-Kontext ausgeschlossen werden. Zum lokalen Trennen den Server stoppen,
die Token-Datei löschen und die App-Freigabe bei Etsy widerrufen.

Der Etsy-Modus verweigert öffentliche Bind-Adressen und öffentliche erlaubte Hosts,
weil der MCP-Server noch keine Benutzeranmeldung hat. Auch keinen Tunnel oder Reverse
Proxy auf diesen lokalen Etsy-Modus schalten: lokale Host-Prüfung ersetzt keine
MCP-Authentifizierung. Die vorhandene Deployment-Vorlage bleibt für den Testmodus.
Vor privatem Remote-Zugriff sind MCP-OAuth und Benutzerzuordnung erforderlich.
Etsy-OAuth erteilt nur dem Server Zugriff auf Etsy und ist eine getrennte Anmeldung.

`.env.example` enthält nur Platzhalter. `ALLOWED_ORIGINS` enthält exakte Browser-
Origins; `ALLOWED_HOSTS` explizite Hostnamen ohne Port. Schreibaktionen und Gelato
bleiben spätere Erweiterungen (siehe `src/tools/README.md`).

Die Etsy-Verbindung ist mit simulierten Anbieterantworten getestet. Eine echte
Shop-Freigabe und Live-Abfrage benötigen deine Zugangsdaten und Browser-Zustimmung.

## Offizielle Quellen

- [OpenAI: MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart) — zustandsloser HTTP-Transport, Inspector und persönliche Plugin-Anbindung.
- [OpenAI: Build an MCP server](https://developers.openai.com/plugins/build/mcp-server) — HTTPS-Deployment und Authentifizierung; OAuth 2.1 für Benutzerzugriff, mTLS für die Client-Identität bei entsprechenden privaten Proxy-Szenarien.
- [MCP TypeScript SDK: Server](https://ts.sdk.modelcontextprotocol.io/server) — Streamable HTTP und zustandsloser Betrieb.
- [MCP SDK v2: Protokollmigration](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28) — separat zu prüfende neuere Server-API.

Die Vorlagen wurden lokal getestet, soweit in `VALIDATION.md` angegeben. Docker,
DNS, Zertifikatsausstellung und Remote-ChatGPT-Anbindung benötigen eine reale
Hosting-Umgebung.

- [Etsy: Authentication](https://developers.etsy.com/documentation/essentials/authentication/) — API-Key/Shared Secret, PKCE, Scopes und Refresh.
- [Etsy: API Reference](https://developers.etsy.com/documentation/reference) — Shop-Eigentümer und paginierte Listings.

## Gelato: Produkt aus einem Ordner erstellen

Der neue Kommandozeilen-Ablauf arbeitet unabhängig vom MCP-Server. Im Eingabeordner muss genau ein Bild (`.jpg`, `.jpeg`, `.png`) und genau eine Beschreibung (`.txt`, `.md`) liegen. Die Dateinamen dürfen unterschiedlich sein; Unterordner werden ignoriert. Das Bild wird als Druckmotiv hochgeladen, ohne Skalierung, Hintergrundentfernung oder Poster-spezifische Zusätze. Für Kleidung möglichst eine ausreichend große PNG mit transparentem Hintergrund verwenden. Die Auflösung muss für die in der Vorlage konfigurierte Druckfläche geeignet sein.

```md
**Title**
Moon Fox, Woodland Art

**Tags**
fox shirt, woodland gift

**Description**
A whimsical fox design for woodland lovers.
```

Alternativ funktionieren `Title: ...`, `Titel: ...`, `Tags: ...` und `Schlagwörter: ...`. Tags dürfen auch aufeinanderfolgende Listenpunkte sein. Title und Tags sind erforderlich; die Extraktion ist regelbasiert. Kommas im Titel werden durch ` | ` ersetzt. Zu lange Titel (über 140 Zeichen), mehr als 13 Tags oder Tags über 20 Zeichen werden gemeldet. Die Beschreibung enthält den übrigen Text; keine digitalen Downloadhinweise werden hinzugefügt.

### Einmalige Einrichtung

1. Gelato-Vorlage für das gewünschte T-Shirt speichern. Darin Größen, Farben, Druckposition, Verkaufspreise und Mockups konfigurieren. Jede Variante braucht genau einen austauschbaren Bildplatzhalter namens `ImageFront`; das Script prüft das vor Erstellung und setzt das Motiv für alle Varianten. `fitMethod: meet` zeigt das ganze Motiv ohne Beschnitt. Weitere Bildplatzhalter führen zu einem Fehler, damit keine alten Vorlagenmotive versehentlich übernommen werden.
2. `GELATO_API_KEY`, `GELATO_STORE_ID` und `GELATO_TEMPLATE_TSHIRT` in der lokalen `.env` setzen. Für Etsy muss die Store-ID zum in Gelato verbundenen Etsy-Shop gehören.
3. Privaten S3-kompatiblen Bildspeicher bereitstellen, etwa AWS S3 oder Cloudflare R2, und die `GELATO_S3_*`-Werte aus `.env.example` ergänzen. Das Script lädt das lokale Bild automatisch hoch und gibt Gelato eine für sieben Tage signierte Downloadadresse. Der Bucket muss nicht öffentlich sein. Temporäre AWS-Zugangsdaten können die Gültigkeit weiter verkürzen; sie müssen für Gelatos Abruf lange genug gültig bleiben. Der Speicherzugang benötigt Lesen und Schreiben im Präfix `giggle-publisher/`. Objekte bleiben im Speicher; nicht vor Gelatos Verarbeitung löschen. Zugangsdaten und signierte URLs werden nicht in Vorschau oder Statusdatei ausgegeben. Es wird kein Speicher automatisch angelegt.

```sh
npm run gelato:preview -- --dir ./mein-motiv
npm run gelato:create -- --dir ./mein-motiv
npm run gelato:resume -- --dir ./mein-motiv
```

Die Vorschau funktioniert ohne Gelato- oder Speicherzugang und schreibt `out/gelato/preview.json` im Eingabeordner. Erstellung schreibt den Fortschritt nach `out/gelato/state.json`. Ein bestehender Auftrag verhindert doppelte Erstellung. `resume` fragt vorhandene Produkt-IDs erneut ab und setzt noch nicht begonnene Profile fort. Gelato arbeitet asynchron; ein Status `created` oder `publishing` ist noch kein Abschluss. `publishing_error` wird als Fehler gemeldet.

Wenn die Antwort auf eine Erstellung verloren geht, wird diese nicht automatisch wiederholt: Zuerst im Gelato-Dashboard und in Etsy nach dem Produkt suchen. Die Statusdatei nicht ungeprüft löschen. Ein abgebrochener Prozess kann `operation.lock` hinterlassen; diese Datei erst entfernen, wenn kein anderer Prozess läuft und der gespeicherte Auftrag geprüft wurde. Änderungen an Bild, Beschreibung, Store, Vorlage oder Produktauswahl werden beim Fortsetzen abgewiesen.

### Etsy und mehrere Produkte

Der API-Aufruf setzt `isVisibleInTheOnlineStore: false`. Bei einem verbundenen Etsy-Shop wird damit ein Entwurf angefordert. Der konkrete Etsy-Entwurfsstatus wird von diesem Ablauf nicht über die Etsy-API verifiziert und muss beim ersten echten Durchlauf im Shop geprüft werden. Gelatos Status `active` bezeichnet den Gelato-Verarbeitungsstatus und ist kein Nachweis für eine aktive Etsy-Veröffentlichung. Es wird kein zweiter, unabhängiger Etsy-Artikel erstellt.

Die endgültige Mehrprodukt-Zusammenstellung ist noch offen. In `config/gelato-products.json` ist zunächst nur `tshirt` enthalten. Longsleeve und Kapuzenjacke können nach Auswahl der konkreten Produkte als weitere Profile mit eigener Template-ID ergänzt werden. `--products tshirt,longsleeve,ziphoodie` erstellt dann je konfiguriertem Profil ein eigenes Gelato-Produkt; das ist kein einzelner Etsy-Artikel mit gemischten Produkttypen. Ein gemeinsamer Mehrprodukt-Artikel ist noch nicht implementiert.

API-Grundlagen: [Produkt aus Vorlage](https://dashboard.gelato.com/docs/ecommerce/products/create-from-template/), [Vorlage auslesen](https://dashboard.gelato.com/docs/ecommerce/templates/get/), [Gelato zu Etsy](https://support.gelato.com/en/articles/8996452-how-do-i-add-gelato-products-to-my-etsy-store).
