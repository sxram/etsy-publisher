# Aktueller Stand und Repository-Struktur

- `gelato/`: Gelato-Erstellung, Druckdateien, Dropbox/S3, Etsy-Nachbearbeitung.
- `etsy/`: Etsy-Zugang und gemeinsame Scripts für Versand, Wasserzeichen und Poster-Mockups.
- Befehle unten aus `gelato/` ausführen. Beide Ordner benötigen ihre npm-Abhängigkeiten und eigene `.env`/OAuth-Dateien.
- Lokale Shirt-Erstellung funktioniert einschließlich Farbübersichten. Chat-Anbindung: MCP-Grundgerüst vorhanden; Gelato-Tools, Remote-Anmeldung, Hosting und vollständiger Chat-Test fehlen noch. Der Ordner-Ablauf läuft unabhängig vom MCP-Server.
- Etsy-Hilfsscripts werden standardmäßig im benachbarten `../etsy/` gesucht. Ein vorhandenes `ETSY_SHIPPING_SCRIPT` überschreibt das: nach dem Umzug entfernen oder auf den neuen absoluten Pfad ändern.

## Physische Poster aus Gelato-Vorlage

Vorlage: `c8f1c3d9-e4c1-44ce-b655-9fb8b8b1c818`; optional über `GELATO_TEMPLATE_POSTER` überschreibbar. Genau drei Hochformat-Varianten mit Größenangabe in den `variantOptions`: 30x40, 45x60, 60x80 cm; genau ein Bildplatzhalter pro Variante. Verkaufspreise und ursprüngliche Gelato-Mockups stammen aus der gespeicherten Vorlage.

```sh
npm run gelato:poster:preview -- --dir ./mein_poster
npm run gelato:poster:create -- --dir ./mein_poster
npm run gelato:poster:resume -- --dir ./mein_poster
```

- Eingabe: genau ein JPG/PNG und eine TXT/MD mit Title, Tags und Beschreibung, wie bei Shirts.
- Motiv muss 3:4-Hochformat haben; andere Seitenverhältnisse werden vor Upload abgewiesen. Kein stiller Beschnitt.
- Drei JPG-Druckdateien mit 300 dpi unter `out/gelato/posters/`: 3543×4724, 5315×7087 und 7087×9449 Pixel. Lanczos-Vergrößerung und leichte Schärfung; Hochskalierung erfindet keine Originaldetails.
- Jede Größenvariante erhält die passende eigene Datei; Upload über denselben Dropbox-/S3-Zugang.
- Nach fertiger Etsy-Übertragung startet automatisch `../etsy/src/process-article.ts`: Versand prüfen, bestehende Etsy-Bilder mit Wasserzeichen versehen und erstes Bild als Rahmen-Mockup aufbereiten. Das Script verarbeitet das von Gelato gelieferte erste Bild; dieses muss in der Vorlage ein geeignetes frontales Poster-Mockup sein.
- Die Etsy-Shop-Abteilung **Poster** muss existieren. Physische Entwürfe werden vor der Nachbearbeitung automatisch zugeordnet; bei bereits veröffentlichten Artikeln wird eine falsche Abteilung zur manuellen Korrektur gemeldet. Keine automatische Änderung einer unbekannten Kategorie.
- Bei asynchroner Übertragung oder Fehlern denselben Resume-Befehl verwenden. Fortschritt/Backups unter `out/gelato/` und `out/etsy-poster/` aufbewahren. Keine automatische Veröffentlichung.
- Vorschau bleibt vollständig lokal. Die neue Vorlage muss beim ersten echten Lauf geprüft werden; unbekannte Variantenbezeichnungen führen zu einem erklärten Abbruch vor Erstellung.

---

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
Origins; `ALLOWED_HOSTS` explizite Hostnamen ohne Port. Gelato-Schreibaktionen sind im lokalen Ordner-Ablauf umgesetzt, aber noch nicht als MCP-Tools registriert (siehe `src/tools/README.md`).

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

Der neue Kommandozeilen-Ablauf arbeitet unabhängig vom MCP-Server. Im Eingabeordner muss genau ein Bild (`.jpg`, `.jpeg`, `.png`) und genau eine Beschreibung (`.txt`, `.md`) liegen. Die Dateinamen dürfen unterschiedlich sein; Unterordner werden ignoriert. Das Motiv wird ohne automatische Weißentfernung als PNG mit bis zu 3800 Pixeln an der längsten Kante und 300 dpi vorbereitet. Seitenverhältnis und vorhandene Transparenz bleiben erhalten. Für Kleidung möglichst eine ausreichend große PNG mit transparentem Hintergrund verwenden. Die Auflösung muss für die in der Vorlage konfigurierte Druckfläche geeignet sein.

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

Tags können über mehrere zusammenhängende Zeilen stehen: ein Tag pro Zeile, Komma-/Semikolonlisten mit Zeilenumbrüchen oder Markdown-Listen (auch nummeriert). Das gilt auch nach `Tags: erster tag`. Den Tag-Block mit einer Leerzeile oder einer Überschrift wie `**Description**` beenden, damit nachfolgender Beschreibungstext getrennt bleibt. Alle erkannten Tag-Zeilen werden aus der Artikelbeschreibung entfernt. Die Grenze von 13 Tags mit jeweils 20 Zeichen bleibt bestehen.

Das T-Shirt-Profil ergänzt die fünf Standardangaben zu Stoff, Nähten, Einlaufen, Nacken-/Schulterband und Farben aus `descriptionDefaults` in `config/gelato-products.json`. Die Ergänzung ist in der Vorschau je Profil sichtbar und wird bei neuen Produkten an die Motivbeschreibung angehängt. Bereits enthaltene Formulierungen werden unter Berücksichtigung von Groß-/Kleinschreibung und Markdown nicht doppelt hinzugefügt. Bestehende Gelato-Produkte werden dadurch nicht nachträglich geändert. Andere Produktprofile erhalten diese T-Shirt-Angaben nur, wenn sie dort ausdrücklich hinterlegt sind.

Das Profil `tshirt` ist für das Kinder-T-Shirt Gildan 5000B vorgesehen und ergänzt den Motivtitel um `Classic Kids Crewneck T-Shirt | Gildan® 5000B`. Die konfigurierte Gelato-Vorlage muss zu diesem Produkt gehören. Der endgültige Titel wird in der Vorschau je Profil angezeigt. Bereits als Titelteile vorhandene Zusätze werden nicht doppelt angehängt. Bei Platzmangel entfällt zuerst `Classic`, anschließend wird der Motivteil an einer Wortgrenze gekürzt, um maximal 140 Zeichen einzuhalten. Der Modellname bleibt erhalten. Der Zusatz ist als `titleSuffix` in `config/gelato-products.json` anpassbar.



Die Bildvorbereitung erzeugt `out/gelato/artwork-prepared.png`. Die Form-Erkennung bleibt als Heuristik aktiv; alle Farben und Varianten der Vorlage sind unabhängig davon verfügbar. Es findet keine Weißentfernung und kein Zuschnitt statt. Bei nicht rechteckigen Motiven wird ein englischer Hinweis auf den sichtbaren Druck des weißen Hintergrunds/Rands auf farbigen T-Shirts ergänzt. Die Originalränder bleiben erhalten.

Gelatos effektive Druckauflösung hängt von Pixelzahl und belegter Druckfläche ab. 300 dpi in den Dateimetadaten garantiert keine effektiven 300 dpi in Gelato; dafür gegebenenfalls die Druckfläche in der Vorlage verkleinern oder eine höher aufgelöste Quelldatei verwenden.

Kleinere Bilder werden mit Lanczos3 auf 3800 Pixel an der längsten Kante hochskaliert und leicht geschärft. Größere Bilder werden entsprechend verkleinert. Dieselbe Vorbereitung gilt für Vorschau und Upload. 3800 Pixel entsprechen bei 300 dpi rund 28,8 cm; die effektive Auflösung hängt weiterhin von der Gelato-Druckposition ab. Hochskalierung interpoliert vorhandene Bildinformationen und erzeugt keine neuen Originaldetails.


Die aktuelle Vorbereitung zielt auf 3800 Pixel an der längsten Kante und maximal 10.000.000 Bytes pro PNG. Zuerst wird verlustfreie PNG-Komprimierung verwendet. Nur falls nötig folgt eine Reduktion auf maximal 256 Farben; falls weiterhin zu groß, wird die Pixelgröße schrittweise reduziert. Die tatsächlich erzeugten Maße und Dateigröße stehen in der Vorschau. Original und bestehende Transparenz bleiben erhalten. Die Farbquantisierung kann feine Farbverläufe verändern.


## Dropbox als Bildspeicher

In `.env` `GELATO_STORAGE_PROVIDER=dropbox` und `DROPBOX_APP_KEY` aus der Dropbox App Console setzen. `GELATO_S3_*` wird dann nicht benötigt. Die App mit App-folder-Zugriff benötigt `files.content.write`, `files.content.read`, `sharing.write` und `sharing.read`. Ein App secret wird nicht benötigt.

Einmalig `npm run dropbox:connect` starten, den ausgegebenen Link öffnen, den Zugriff bestätigen und den auf Dropbox angezeigten Autorisierungscode im wartenden Terminal eingeben. Kein Redirect-URI-Eintrag erforderlich. Das Script verwendet PKCE und Offline-Zugriff; die Zugangsdaten werden mit Dateirechten 600 in `.private/dropbox-tokens.json` gespeichert und automatisch erneuert. Keine Codes/Token im Chat oder in Git ablegen.

Danach gelten unverändert `gelato:preview`, `gelato:create` und `gelato:resume`. Bei Erstellung lädt das Script die vorbereitete PNG in den Dropbox-App-Ordner und erstellt einen öffentlichen Freigabelink mit direktem Bildabruf. Wer den Link kennt, kann das Bild herunterladen. Der Link wird nicht in Vorschau/Statusdatei protokolliert. Vorhandene Freigaben werden wiederverwendet. Dateien werden nach ihrem Inhalt benannt und bleiben für Gelatos asynchrone Verarbeitung verfügbar. Nicht vorzeitig löschen; es gibt derzeit keine automatische Bereinigung. Der echte Gelato-Abruf via Dropbox muss beim ersten Produkt geprüft werden.

Für die Etsy-Übertragung wird das Größen-/Farbraster vor dem Upload geprüft. Alle Vorlagenfarben bleiben erhalten; Größen, die nicht in jeder Farbe vorhanden sind, werden weggelassen und im Terminal genannt. Die aktuelle Gildan-Vorlage enthält deshalb S, M, L und XL in 18 Farben (72 Kombinationen), ohne XS. Andere Dimensionen oder doppelte Kombinationen werden zur Prüfung angehalten.

Dropbox-Downloads werden jetzt über `dl.dropboxusercontent.com` direkt ohne Weiterleitung übergeben. Vor dem Gelato-POST lädt das Script die öffentliche URL ohne Zugangsdaten und ohne Redirect-Erlaubnis herunter und prüft PNG-Content-Type sowie bytegenaue Übereinstimmung mit der lokalen Druckdatei. Ein erfolgreicher Downloadtest bestätigt die Abrufbarkeit vom ausführenden Rechner, nicht die spätere Verarbeitung durch Gelato.

Nach Rückgabe einer Etsy-ID kann der Publisher die eigene Entwurfsbeschreibung mit Leerzeilen setzen und die Kategorie aus `etsyTaxonomyId` korrigieren (Kinder-T-Shirts: 11170). Dazu `ETSY_ENABLED=true` und einmalig `npm run etsy:connect` mit `listings_w` bestätigen. Bereits veröffentlichte Artikel werden nicht automatisch geändert. Existiert genau ein Etsy-Produktionspartner namens Gelato, wird dieser unter Erhalt bestehender Partnerzuordnungen ergänzt. Andernfalls ist die einmalige Anlage/Prüfung im Etsy-Editor erforderlich. Die Herstellungsweise und GPSR-Felder bleiben manuelle Prüfpunkte, da dafür keine dokumentierten öffentlichen API-Felder vorliegen. Die unter `.private/product-contact.json` bestätigten Gelato-Herstellerdaten werden nach fertiger Etsy-Übertragung bei create/resume in der Artikelbeschreibung ergänzt (auch bei veröffentlichten Artikeln, ohne ihren Status zu ändern). Die separaten GPSR-Editorfelder sind weiterhin manuell; Sicherheitsangaben werden nicht erfunden. Fehler führen zu einem offenen manufacturerCheck und Exitstatus 1. Der Etsy-Zugang des Versand-Hilfsprojekts wird verwendet.
Gelato erhält die Beschreibung künftig mit HTML-Absätzen und `<br>`-Umbrüchen; Etsy erhält für die direkte Nachbearbeitung Klartext mit Leerzeilen. Bestehende Gelato-Produktbeschreibungen werden damit nicht rückwirkend aktualisiert.

Das T-Shirt-Profil ordnet eigene Etsy-Entwürfe bei der Nachbearbeitung der Shop-Abteilung `Kids T-Shirts` zu (`etsySection` im Produktprofil). Die Abteilung muss bereits im Shop existieren; fehlt sie, wird dies vor der Änderung gemeldet.


### Automatische Etsy-Versand-Länderausschlüsse

`gelato:create` und `gelato:resume` rufen nach Erhalt der Etsy-Artikel-ID automatisch die gezielte Versandprüfung aus dem Projekt `etsy-poster-to-digital` auf. `ETSY_SHIPPING_SCRIPT` muss auf dessen absoluten Pfad `src/shipping-exclusions.ts` zeigen. Der Unterprozess nutzt ausdrücklich die .env und Etsy-OAuth-Datei dieses Etsy-Projekts; Etsy-Zugangsdaten beider Projekte werden nicht vermischt. Dort muss `shops_w` einmal freigegeben sein. Der optionale eigene Etsy-Zugang des Giggle-Publishers für Kategorie/Beschreibung bleibt davon unabhängig.

Die Regeln werden zentral in `etsy-poster-to-digital/config/shipping-exclusions.json` gepflegt: aktuell Poster ohne Spanien und Kids T-Shirts ohne Frankreich/Spanien. Der Artikel muss nach der Etsy-Nachbearbeitung der passenden Shop-Abteilung zugeordnet sein. Geteilte Profile mit widersprüchlichen Regeln werden nicht automatisch geändert. Profiländerungen wirken auf alle zugeordneten Artikel. Das Erstellen eines neuen Gelato-Produkts ist zum Fortsetzen niemals nötig.

Solange die Etsy-ID fehlt oder die Prüfung scheitert, steht der offene Schritt in `<motiv>/out/gelato/state.json` unter `shippingCheck`; das Kommando weist sichtbar darauf hin und endet mit Status 1. Danach denselben `gelato:resume -- --dir …`-Aufruf verwenden. Bei jedem Resume wird erneut geprüft, damit spätere Profiländerungen erkannt werden. Es gibt keine laufende Hintergrundüberwachung; nach manuellen Änderungen oder späteren Gelato-/Printify-Synchronisationen erneut Resume ausführen. Eine erfolgreiche Versandprüfung veröffentlicht den Artikel nicht und ersetzt keine GPSR- oder Rechtstextprüfung.


### Lokale Farbmockups für Gildan 5000B

```sh
npm run gelato:mockups -- --dir ./motiv_gcosmos
npm run gelato:mockups -- --dir ./motiv_gcosmos --colors white,black,navy
```

Erzeugt `out/color-mockups/` mit Einzelbildern, zwei Übersichten (maximal sechs Farben pro Seite) und `report.json`. Vorhandener weißer Bildhintergrund und das vollständige Motiv bleiben erhalten; keine Transparenzentfernung, kein Crop. Die Rohlinge werden anhand ihrer Prüfsumme validiert. Druckbereiche stehen in `assets/mockups/gildan-5000b/calibration.json` und sind vorläufig aus dem weißen Etsy-Referenzmockup des Space-Squad-Artikels abgeleitet. Bei anderem Shirtmodell oder veränderter Gelato-Druckposition neu kalibrieren.

Ash und Dark Heather fehlen als verifizierte flache Vorlagen; sie werden gemeldet und nicht durch andere Farben ersetzt. Standardmäßig wird die vorhandene 12-Farben-Bibliothek als lokale Vorschau erzeugt, nicht die aktuelle Farbauswahl einer beliebigen Gelato-Vorlage. Für eine Teilmenge `--colors` verwenden. Die Druckplatzierung wurde bestätigt; `readyForUpload` folgt dem Freigabestatus in der Kalibrierung. Der separate Vorschau-Befehl selbst lädt nichts hoch. Siehe automatischer Etsy-Upload unten.


### Etsy-Farbübersichten automatisch ergänzen

Das Profil `tshirt` mit `colorMockupModel: gildan-5000b` erzeugt bei `gelato:create`/`gelato:resume` nach fertiger Gelato-Übertragung lokale Farbübersichten und hängt nur diese an Etsy an. Die angebotenen Farben kommen aus Gelatos `productVariantOptions`; unbekannte Farben stoppen den Mockup-Schritt. Ash und Dark Heather werden als fehlend gemeldet und nicht ersetzt. Andere Modelle benötigen eigene Rohlinge und Kalibrierung.

Der Upload nutzt den vorhandenen Etsy-Zugang des Versand-Hilfsprojekts, erhält alle vorhandenen Bilder und deren Reihenfolge und prüft das 20-Bilder-Limit. Nach Upload wird anhand gespeicherter Bild-IDs und eindeutiger Alternativtext-Marker abgeglichen. Ein erneutes Resume lädt keine Duplikate hoch. Bei ungewissem Upload ohne eindeutigen Marker wird angehalten, statt blind erneut hochzuladen. Der lokale Bericht enthält SHA-256-Prüfsummen, das Uploadjournal liegt neben ihm unter `etsy-upload-<ID>.json`. Veränderte Übersichten nach einem früheren Upload benötigen eine separate Prüfung; es gibt keinen automatischen Austausch oder Löschschritt.

Die bestätigte Platzierung steht in `assets/mockups/gildan-5000b/calibration.json`. Die Vorschau allein bleibt lokal: `npm run gelato:mockups -- --dir ./motiv`. Danach erfolgt der Upload mit `npm run gelato:resume -- --dir ./motiv`. Offene Schritte werden in `out/gelato/state.json` unter `mockupCheck` gespeichert und führen zu Exitstatus 1. Die vorhandene Gelato-Erstellung bleibt vor Duplikaten geschützt.

Weiße Shirts bleiben als separates ursprüngliches Mockup erhalten. Die Farbübersichten schließen Weiß aus und enthalten bis zu sechs farbige Shirts pro Seite (aktuell 6 + 5). Bereits hochgeladene eigene Übersichten können bei unverändertem Motiv mit dem Hilfsbefehl `mockups:upload ... --apply --refresh-managed` gezielt an ihren bisherigen Rängen ersetzt werden. Dafür müssen IDs und Marker exakt zum Uploadjournal passen; Originalbilder werden weiterhin geschützt.

Die Vorlage wurde am 20. Oktober 2026 lesend geprüft: alle drei Größen vorhanden, aber je zwei Bildplatzhalter (`Image 3` und `whimsical_moonlit_village_canal_300dpi.png`). Vor Erstellung auf genau einen Motiv-Platzhalter je Variante reduzieren und speichern. Der Ablauf hält bis dahin vor Upload/Erstellung an.

Poster-Beschreibungen werden nach fertiger Etsy-Übertragung direkt mit den ursprünglichen Leerzeilen korrigiert, auch bei `gelato:poster:resume`. Ein vorhandener GPSR-Block bleibt erhalten. Bei inhaltlich abweichendem Etsy-Text stoppt die Korrektur, um manuelle Änderungen zu schützen. Der Artikelstatus bleibt unverändert. Gelato erhält weiterhin HTML-Absätze; die nachträgliche Korrektur betrifft Etsy.
