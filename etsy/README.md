# Etsy Poster → Digital

TypeScript CLI for converting existing physical Etsy poster listings into **digital instant-download draft listings**.

The tool is designed for a workflow where the physical poster already exists on Etsy and the high-resolution printable files are stored locally.

Current state:
- Poster matching works
- Portrait + landscape files can be grouped automatically
- Digital drafts can be created
- Existing drafts can be resumed safely
- Digital files are uploaded and verified
- Listings are configured as **instant downloads**, not "made to order"
- Titles, descriptions and tags are generated/adapted automatically
- Batch preview / creation is supported
- Draft prices can be changed separately with `price-drafts.ts`

---

## Requirements

- Node.js 20+  
- Etsy Developer App
- Etsy API Key / Keystring
- Etsy Shared Secret
- OAuth access to your own Etsy shop

---

## Installation

```bash
npm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Example:

```dotenv
ETSY_API_KEY=your_keystring
ETSY_SHARED_SECRET=your_shared_secret

ETSY_REDIRECT_URI=http://localhost:3003/oauth/callback
ETSY_SCOPES=shops_r listings_r listings_w

POSTER_KEYWORDS=poster,wall art,nursery,print

DIGITAL_PRICE=2.49
DIGITAL_FILES_DIR=./originals
DIGITAL_TITLE_SUFFIX= | Printable Wall Art | Digital Download

# Important: do not use made_to_order for instant digital downloads.
DIGITAL_WHEN_MADE=2020_2026

DIGITAL_CONSTANT_TAGS=digital download,printable wall art,nursery printable,kids room decor

# Optional
DIGITAL_PREFERRED_TAGS=
DIGITAL_BLOCKED_TAGS=kids room wall,kids room wall art,nursery and kids bedroom decor,alien cosmic
```

---

# Etsy OAuth

Authenticate once:

```bash
npm run auth
```

The browser opens Etsy authorization.

The token is stored locally in:

```text
.etsy-token.json
```

Do not commit `.env` or `.etsy-token.json`.

Check the connected Etsy shop:

```bash
npm run whoami
```

---

# Read Etsy listings

List all active listings:

```bash
npm run list
```

Find physical poster listings:

```bash
npm run posters
```

Exports are written to `out/`.

---

# Local printable files

Place the high-resolution files in a directory such as:

```text
originals/
```

Example:

```text
Purple Alien Space Poster_Nova_Luna_3x4_60x80cm_300dpi.jpg
Purple Alien Space Poster_Nova_Luna_4x3_80x60cm_300dpi.jpg

Yellow Alien Space Poster_Pip_Comet_3x4_60x80cm_300dpi.jpg
Yellow Alien Space Poster_Pip_Comet_4x3_80x60cm_300dpi.jpg
```

Spaces in filenames are fine.

The two Purple Alien files are grouped automatically into one digital product:

```text
Purple Alien Space Poster_Nova_Luna
```

The tool recognizes suffixes such as:

```text
_3x4_60x80cm_300dpi
_4x3_80x60cm_300dpi
_2x3_40x60cm_300dpi
_4x5_40x50cm_300dpi
_portrait
_landscape
_vertical
_horizontal
_hochformat
_querformat
```

---

# Scan local files

```bash
npm run digital:scan -- --dir ./originals
```

Example:

```text
✓ Purple Alien Space Poster_Nova_Luna
  - Purple Alien Space Poster_Nova_Luna_3x4_60x80cm_300dpi.jpg
  - Purple Alien Space Poster_Nova_Luna_4x3_80x60cm_300dpi.jpg
```

---

# Matching logic

For Etsy titles such as:

```text
Purple Alien Space Poster | Cute Alien & Cosmic Cat | Kids Room Wall Art | Galaxy Nursery Decor | Giggle Cosmos
```

the matcher first uses the main title:

```text
Purple Alien Space Poster
```

and strongly prefers:

```text
Purple Alien Space Poster_Nova_Luna
```

over unrelated groups such as:

```text
Cute Alien Space Poster_Milo_Cosmo
```

If matching is not clear enough, the script refuses to guess.

Manual override:

```bash
npm run digital:preview -- \
  --listing 4589225523 \
  --dir ./originals \
  --group "Purple Alien Space Poster_Nova_Luna"
```

---

# Preview one digital listing

```bash
npm run digital:preview -- \
  --listing 4589225523 \
  --dir ./originals
```

Nothing is changed on Etsy.

The preview shows:

- source listing
- matched local files
- generated digital title
- price
- generated tags
- generated digital description

---

# Generated title

The physical Etsy title is adapted for a digital listing.

Example:

```text
Purple Alien Space Poster | Cute Alien & Cosmic Cat | Kids Room Wall Art | Galaxy Nursery Decor | Printable Wall Art | Digital Download
```

The tool keeps the title below Etsy's 140-character limit and avoids cutting words in half.

---

# Description conversion

The unique artwork description is preserved.

Everything starting at:

```text
Print details
```

is removed.

For example, the physical print-specific parts are removed:

- paper type
- GSM
- shipping
- print-on-demand details
- physical size selector
- physical production notes

They are replaced with a digital section such as:

```text
DIGITAL DOWNLOAD

You will receive 2 high-resolution files.

Included files:
- 3:4 portrait — 60 × 80 cm — 300 dpi
- 4:3 landscape — 80 × 60 cm — 300 dpi

How to print
- Download the files after purchase.
- Print at home, at a local print shop, or upload the file to an online printing service.
- Use the file with the aspect ratio matching the intended print size.
- Files can be printed at the listed maximum size or smaller.

Please note
- This is a digital product. No physical item will be shipped.
- Frame is not included.
- Colors may vary depending on screen, printer, paper and print settings.
- Digital files are for personal use unless otherwise stated in the shop terms.
```

---

# Tag generation

Tags are generated automatically from:

- Etsy title
- artwork description
- `Perfect for` bullet points
- theme detection
- fixed digital tags

The tool avoids weak/redundant tags such as:

```text
kids room wall
```

and can create stronger theme tags such as:

```text
alien nursery art
space nursery decor
galaxy nursery decor
space poster
purple alien
cosmic cat
kids room decor
digital download
printable wall art
nursery printable
```

Maximum:

```text
13 tags
```

Each tag is limited to Etsy's maximum length.

Optional `.env` tuning:

```dotenv
DIGITAL_PREFERRED_TAGS=space nursery decor,galaxy nursery decor,alien nursery art
DIGITAL_BLOCKED_TAGS=kids room wall,kids room wall art,alien cosmic
```

---

# Create one digital draft

After checking the preview:

```bash
npm run digital:create -- \
  --listing 4589225523 \
  --dir ./originals
```

The command:

1. reads the physical source listing
2. finds the local printable files
3. generates title
4. generates description
5. generates tags
6. copies listing images
7. creates a new Etsy draft
8. configures it as a digital product
9. uploads all associated files
10. configures it as an **instant download**
11. verifies the uploaded files

It does **not publish** the listing.

---

# Instant Download vs. "Made to order"

This is important.

Physical POD listings often contain:

```text
when_made=made_to_order
```

That value must **not** be copied to the digital listing.

Otherwise Etsy enables:

```text
This digital item is made to order
```

and the uploaded files do not appear as normal instant-download files.

Generated digital listings therefore use:

```text
type=download
when_made=2020_2026
is_supply=false
```

The year range can be configured:

```dotenv
DIGITAL_WHEN_MADE=2020_2026
```

---

# Resume an existing draft

If a draft was already created but a later step failed:

```bash
npm run digital:resume -- \
  --listing 4589225523 \
  --dir ./originals
```

Resume will:

1. find the existing digital draft
2. configure instant-download mode
3. query existing files
4. skip files already attached
5. upload only missing files
6. verify all files

The script also accounts for Etsy changing filenames.

Example:

Local:

```text
Purple Alien Space Poster_Nova_Luna_3x4_60x80cm_300dpi.jpg
```

Etsy may store:

```text
PurpleAlienSpacePoster_Nova_Luna_3x4_60x80cm_300dpi.jpg
```

Spaces, `_` and `-` are ignored when comparing existing files.

---

# Preview all posters

Before creating everything:

```bash
npm run digital:preview-all -- --dir ./originals
```

The batch preview shows all physical posters and their local matches.

Possible statuses include:

```text
READY
AMBIGUOUS
GROUP_REUSED
EXISTS
```

Only safe matches should be created automatically.

---

# Create all safe digital drafts

After reviewing the batch preview:

```bash
npm run digital:create-all -- \
  --dir ./originals \
  --confirm
```

The batch processes all safe matches.

A failure on one product does not stop the remaining products.

No listing is automatically published.

---

# Change prices of digital drafts

The separate helper:

```text
src/price-drafts.ts
```

can change the price of existing digital drafts without modifying descriptions, tags or files.

Preview first:

```bash
npx tsx src/price-drafts.ts preview --price 2.49
```

Apply:

```bash
npx tsx src/price-drafts.ts update --price 2.49 --confirm
```

Only matching **draft listings** are changed.

Published products are not modified.

Listings that are already at the requested price are skipped.

Current recommended launch price:

```text
2.49 €
```

---

# Typical workflow

For new physical posters:

```bash
npm run digital:preview-all -- --dir ./originals
```

Review the matches.

Then:

```bash
npm run digital:create-all -- --dir ./originals --confirm
```

If something fails halfway:

```bash
npm run digital:resume -- \
  --listing PHYSICAL_LISTING_ID \
  --dir ./originals
```

If prices need adjusting later:

```bash
npx tsx src/price-drafts.ts preview --price 2.49
npx tsx src/price-drafts.ts update --price 2.49 --confirm
```

---

# Safety principles

The scripts intentionally:

- create drafts only
- do not publish automatically
- refuse ambiguous filename matches
- prevent obvious duplicate digital drafts
- detect reused file groups
- skip already uploaded files during resume
- require `--confirm` for batch creation and price updates
- leave failed drafts unpublished for manual inspection

---

# Files that should never be committed

```text
.env
.etsy-token.json
node_modules/
out/
```

Recommended `.gitignore`:

```gitignore
node_modules/
.env
.etsy-token.json
out/
dist/
.DS_Store
```

## Wasserzeichen für Etsy-Vorschaubilder (v0.4.0)

Voraussetzung: Node.js 22 oder neuer, `npm install`, bestehende `.env` und Etsy-Anmeldung mit `listings_r`, `listings_w`, `shops_r`. Die bisherigen Befehle bleiben erhalten.

### 1. Vorschauen und Original-Backups erstellen

```bash
npm run watermark:prepare
```

Liest sämtliche Seiten aller Listing-Zustände (active, draft, inactive, expired, sold_out). Wählt ausschließlich Artikel in den Shop-Bereichen `Poster` und `Poster-Digital` anhand ihrer `shop_section_id`, unabhängig von Titel oder Produkttyp. Beide Bereiche müssen eindeutig vorhanden sein. Verarbeitet **alle Vorschaubilder** dieser Listings, nicht nur das Titelbild. Prüfe vor dem Upload die ausgegebenen Listing-IDs und die JPGs unter `out/watermark/<listing-id>/`.

Originale werden unverändert als `*-original.bin` gesichert (Bilddateien mit neutraler Endung), Vorschauen als `*-watermarked.jpg`. Maximal 2400 Pixel an der längsten Seite, kein Hochskalieren. Standard: ein einzelner Schriftzug „GigglingHome“ im oberen Drittel des Bildes, horizontal zentriert, um 18° geneigt, Deckkraft 0.14. Seine Breite beträgt ungefähr 35–45 % der Bildbreite, abhängig von Text und Schrift. Dies erschwert das Kopieren; vollständigen Schutz bietet ein Wasserzeichen nicht.

```bash
npm run watermark:prepare -- --listing 123456789 --text "GigglingHome" --opacity 0.14
npm run watermark:prepare -- --state active,draft --dir out/watermark-run-2
```

`WATERMARK_TEXT` und `WATERMARK_OPACITY` können alternativ in `.env` stehen. CLI-Werte haben Vorrang. Für jeden neuen Vorbereitungslauf einen neuen `--dir` verwenden; bestehende Manifeste werden nicht überschrieben.

### 2. Erst ein Bild testen, danach alle ersetzen

```bash
npm run watermark:apply -- --limit 1
# Ergebnis auf Etsy prüfen, danach Rest fortsetzen:
npm run watermark:apply
```

Etsy `uploadListingImage` wird mit `rank` und `overwrite=true` verwendet. Es wird kein Bild vorher gelöscht. Anzahl, Reihenfolge und IDs der übrigen Bilder werden nach jedem Upload geprüft; bei Abweichungen stoppt der Lauf. Alt-Text wird übernommen. Alle Uploads laufen nacheinander. Es werden keine Listings veröffentlicht und keine digitalen Käufer-Download-Dateien verändert.

Das Manifest `out/watermark/manifest.json` speichert den Fortschritt. Erfolgreiche Bilder werden bei einem erneuten Lauf übersprungen. Nach einem Upload-Timeout, Prozessabbruch oder einer fehlgeschlagenen Verifikation bleibt der Eintrag `pending` bzw. `restoring`: der nächste Lauf stoppt, damit kein zweites Wasserzeichen entsteht. In diesem Fall Etsy mit dem Backup und Manifest vergleichen. Ist nichts geändert worden, Status wieder `prepared` (bzw. `applied` bei Restore) setzen. Ist der Upload gelungen, tatsächliche neue Etsy-Bild-ID unter `newId` und Status `applied` (bzw. `restored`) eintragen. Bei geänderter Reihenfolge erst die Etsy-Galerie korrigieren. `.lock` nach einem Prozessabbruch nur entfernen, wenn kein Lauf mehr aktiv ist.

Nicht gleichzeitig im Etsy-Editor oder durch andere Tools dieselben Bilder bearbeiten. `overwrite` ist keine Transaktion; bei unerwartetem API-Verhalten ist manuelle Kontrolle erforderlich. Backups und Manifest zusammen dauerhaft aufbewahren. Nicht nach einem erfolgreichen Lauf erneut in einem neuen Ordner vorbereiten: bereits markierte Etsy-Bilder würden nochmals markiert.

### Originale zurückspielen

```bash
npm run watermark:restore
# oder nur ein Listing:
npm run watermark:restore -- --listing 123456789
```

Ersetzt erfolgreich markierte Bilder durch die lokal gesicherten Originale, nachdem die aktuelle Bild-ID überprüft wurde. Andere zwischenzeitliche Bildänderungen führen zum Stopp. Bei abweichendem Ausgabeordner bei **jedem** Befehl denselben `--dir` angeben.

### Prüfung

```bash
npm run typecheck
npm run test:watermark
```

API-Referenz: https://developer.etsy.com/documentation/reference/#operation/uploadListingImage

## Preise aktiver digitaler Artikel ändern

`price-drafts.ts` unterstützt jetzt `--state active`. Ohne diesen Parameter werden weiterhin ausschließlich Entwürfe ausgewählt.

```bash
# Vorschau: alle passenden aktiven digitalen Artikel
npx tsx src/price-drafts.ts preview --state active --price 2.99
# Änderungen nach Prüfung der Tabelle ausführen
npx tsx src/price-drafts.ts update --state active --price 2.99 --confirm
```

Der Preis gilt in der Shop-Währung. Es werden alle passenden Listings und alle ihre Inventory-Angebote auf denselben Preis gesetzt. Es werden ausschließlich Artikel im Shop-Bereich **Poster-Digital** ausgewählt, anhand seiner Etsy-`shop_section_id`. Titelwörter und Produkttyp dienen nicht mehr als Auswahlfilter. Fehlt der eindeutig benannte Bereich, bricht der Lauf ohne Preisänderung ab. Prüfe deshalb die Vorschautabelle. Bereits passende Preise werden übersprungen; Änderungen werden erneut aus Etsy gelesen und verifiziert. Der Listing-Zustand wird nicht geändert.

Nur `draft` und `active` sind zulässig. Eine unbekannte Angabe führt zum Abbruch.

Für Preisänderungen gilt ab jetzt immer der Shop-Bereich `Poster-Digital`, sowohl bei `--state active` als auch bei Entwürfen. Vor jedem Preis-Upload wird die aktuelle Bereichszuordnung und der Zustand erneut geprüft. Ältere Hinweise auf eine Auswahl über digitale Titelwörter gelten für dieses Skript nicht mehr.

### Dezentes Wasserzeichen

Der neue Standard ersetzt das wiederholte Muster durch einen einzelnen, horizontal mittigen Schriftzug im oberen Drittel. Falls in deiner bestehenden `.env` noch `WATERMARK_OPACITY=0.22` steht, ändere es auf `0.14` oder verwende `--opacity 0.14`. Bereits vorbereitete JPGs ändern sich durch ein Code-Update nicht. Vor dem ersten Upload kannst du eine neue Vorbereitung in einem anderen Ordner durchführen. Bereits auf Etsy markierte Bilder zuerst mit dem alten Manifest und `watermark:restore` zurückspielen; danach einen neuen Vorbereitungslauf durchführen. Sonst würde das neue Wasserzeichen zusätzlich über das alte gesetzt. Die Position bezieht sich auf das gesamte Mockup; kontrolliere deshalb, ob der Schriftzug auch das darin abgebildete Poster trifft.

### Wasserzeichen nur für Poster-Bereiche

Die feste Auswahl umfasst ausschließlich die Shop-Bereiche `Poster` und `Poster-Digital`, einschließlich physischer Poster. Sie gilt bei Vorbereitung, Upload und Wiederherstellung, auch mit `--listing` oder einem älteren Manifest. Vor jedem Upload wird die aktuelle Bereichszuordnung geprüft. `--all-digital` wurde entfernt und wird als unbekannte Option abgewiesen. Es werden weiterhin alle Vorschaubilder der ausgewählten Artikel verarbeitet.

Der Schriftzug sitzt jetzt exakt bei 50 % der Bildbreite und 16,7 % der Bildhöhe, weiterhin um 18° geneigt. Die Deckkraft ist über `--opacity` einstellbar. Bestehende Vorschauen müssen neu vorbereitet werden, um die neue Position zu verwenden.

## Haupt-Mockup: zusätzliches erstes Bild

`mockup:prepare` verwendet das bisherige Bild mit `rank=1` ausschließlich aus den Shop-Bereichen **Poster** und **Poster-Digital**. Das vollständige Gelato-Bild samt weißem Rand bleibt erhalten und wird in einen schwarzen Holzrahmen vor einer fotografisch wirkenden Wand mit Holzboden eingesetzt. Die KI-generierte Hintergrunddatei `assets/mockup-wall-floor.jpg` muss mit übernommen werden; das eigentliche Motiv wird vom Skript unverändert und proportional eingesetzt. Es wird nichts vom Motiv abgeschnitten. Ausgabe: 2400 × 2400 Pixel, großer Rahmen mit wenig Hintergrund und Hinweis, dass der Rahmen nicht enthalten ist.

```bash
# Ein Listing ausprobieren (echte ID einsetzen):
npm run mockup:prepare -- --listing 123456789 --dir out/mockup-gross
# Oder alle Artikel der beiden Bereiche:
npm run mockup:prepare -- --state active,draft --dir out/mockup-batch
```

Ohne `--state` werden alle Listing-Zustände berücksichtigt. Ohne `--dir` ist der Standardordner `out/mockup`. Prüfe die JPGs vor dem Upload: bestehende Einrichtungsszenen werden nicht erkannt, sondern vollständig mit eingerahmt. Backups und Manifest zusammen aufbewahren.

### Einfügen, nicht ersetzen

```bash
npm run mockup:apply -- --dir out/mockup-gross --limit 1
# Nach Kontrolle auf Etsy:
npm run mockup:apply -- --dir out/mockup-gross
```

**Das neue Rahmen-Mockup wird zusätzlich an Position 1 eingefügt (`overwrite=false`). Das bisherige Hauptbild bleibt sichtbar an Position 2, alle übrigen Bilder rücken um einen Platz nach hinten.** Der Lauf prüft die gesamte Bildfolge und Anzahl nach dem Upload. Er löscht keine bestehenden Bilder, um Platz zu schaffen. Bei 20 vorhandenen Bildern stoppt er vor dem Upload; eine eventuelle niedrigere API-Grenze führt ebenfalls zum Fehler, ohne bewusst ein Bild zu löschen.

Ein erneuter Apply-Lauf im selben Ordner überspringt erledigte Einträge. Ein neuer Vorbereitungslauf in einem neuen Ordner kann ein weiteres Rahmenbild erzeugen: Es gibt keine optische Erkennung vorhandener Rahmen. Bestehende noch nicht hochgeladene Vorschauen und `prepared`-Manifeste funktionieren mit der neuen Einfüge-Version; eine erneute Vorbereitung ist dafür nicht nötig.

Das Manifest enthält `operation=insert`, die vorherige Galerie-Reihenfolge unter `previousIds` und die eingefügte Bild-ID unter `newId`. Bei `pending` oder `restoring` ist der Ausgang einer früheren Anfrage unsicher; Etsy manuell vergleichen, bevor der Status korrigiert wird. Falls Etsy den Upload vorgenommen, aber die Verifikation nicht bestanden hat, kann das neue Bild schon vorhanden sein. Die Bild-ID wird daher direkt nach der Upload-Antwort gespeichert. Nicht gleichzeitig dieselbe Galerie in anderen Tools oder im Etsy-Editor bearbeiten.

### Rückgängig machen

```bash
npm run mockup:restore -- --dir out/mockup-gross
```

Restore entfernt **nur das in diesem Lauf neu eingefügte Rahmenbild anhand seiner ID**. Vorher und nachher wird die Galerie geprüft. Originale werden nicht neu hochgeladen. Ältere bereits angewendete Manifeste aus der früheren Ersetzungs-Version werden dafür abgewiesen; zum Zurückspielen ihres ursprünglichen Hauptbildes die frühere Skriptversion verwenden. Alte noch nicht angewendete Manifeste sind kompatibel.

### Reihenfolge mit Wasserzeichen

1. Rahmen-Mockups aus unmarkierten Originalen vorbereiten und einfügen.
2. Danach Wasserzeichen in einem **neuen** Ordner vorbereiten und hochladen. Dadurch werden sowohl das neue Rahmenbild als auch das erhaltene Original und weitere Mockups markiert.

Bereits vor einem Mockup-Upload vorbereitete Wasserzeichen nicht weiterverwenden: Bild-IDs und Positionen haben sich geändert. Falls Wasserzeichen schon hochgeladen wurden, zuerst diese mit ihrem bisherigen Manifest zurückspielen. Nach weiteren Galerie-Änderungen stoppt Mockup-Restore. Beim Watermark-Restore werden neue Etsy-Bild-IDs erzeugt; danach müssen die aktuelle eingefügte Bild-ID unter `newId` und die übrigen Galerie-IDs unter `previousIds` im Mockup-Manifest anhand Etsy abgeglichen werden, bevor Mockup-Restore funktioniert. Dafür keine IDs raten.

Die Befehle verändern weder Preise noch Listing-Zustand oder Käufer-Download-Dateien. Beschränkung auf die beiden Shop-Bereiche gilt auch beim Upload und Restore.

Ein Beispiel steht unter `examples/hauptmockup-beispiel.jpg`. Motivfläche maximal 1910 Pixel hoch bzw. 2030 Pixel breit. Hintergrund-Prompt (Imagegen): leere warmweiße Putzwand mit schmaler Sockelleiste, natürlichem Eichenboden, weichem Sonnenlicht und Fensterschatten, frontale Kamera, keine Rahmen, Motive, Möbel oder Texte.

```bash
npm run typecheck
npm run test:mockup
```

### Wasserzeichen zurücksetzen und oben neu setzen

Zuerst `npm run watermark:restore -- --dir ORDNER_DES_BISHERIGEN_WATERMARK_LAUFS` ausführen. Dieser Ordner muss die tatsächlich hochgeladenen Wasserzeichen, ihre Original-Backups und das zugehörige Manifest enthalten. Nicht den Mockup-Ordner verwenden. Erst nach erfolgreichem Restore neu vorbereiten, z. B. `npm run watermark:prepare -- --opacity 0.22 --dir out/watermark-oben`, Vorschauen prüfen und anschließend `npm run watermark:apply -- --dir out/watermark-oben`. Die Deckkraft bleibt konfigurierbar. Der Text sitzt bei 16,7 % der gesamten Bildhöhe und bleibt um 18° geneigt. Bei Raumszenen die Platzierung auf dem tatsächlichen Poster kontrollieren.

### Verzögerte Etsy-Galerie und pending-Einträge

Nach Einfügen oder Entfernen prüft das Skript die Galerie mehrfach (sofort, dann nach 1, 2, 4 und 8 Sekunden). Es wiederholt ausschließlich Leseanfragen, niemals den Upload. Bei einer dauerhaft abweichenden Galerie werden erwartete und tatsächliche IDs/Positionen ausgegeben; der Status bleibt offen.

```bash
npm run mockup:reconcile -- --dir out/mockup-alle
npm run mockup:apply -- --dir out/mockup-alle
```

Reconcile verändert keine Etsy-Bilder. Es prüft für `pending`, ob die Galerie exakt dem eingefügten Mockup plus den ursprünglichen Bildern entspricht, und setzt erst dann `applied`. Für `restoring` muss exakt die ursprüngliche Galerie vorliegen, bevor `restored` gespeichert wird. Fehlende `newId` oder Galerie-Abweichungen führen zum Stopp; es werden keine IDs geraten. Ein erneuter Apply-Lauf überspringt erfolgreich abgeglichene Einträge.

### Doppelte Rangwerte von Etsy

Etsy kann nach dem Einfügen sowohl das neue als auch das bisherige Hauptbild mit `rank=1` melden und die alten Ränge unverändert lassen. Apply/Reconcile und Restore akzeptieren zusätzlich zur fortlaufenden Rangfolge exakt dieses Muster: neue ID auf Rang 1 plus sämtliche bisherigen IDs mit ihren ursprünglichen Rängen. Anzahl und Eindeutigkeit aller Bild-IDs müssen stimmen. Beliebige andere doppelte Ränge, fehlende oder zusätzliche Bilder werden nicht akzeptiert. Die sichtbare Reihenfolge im Etsy-Shop bitte beim ersten Upload kontrollieren; aus doppelten Rangwerten allein lässt sie sich nicht eindeutig ableiten.

## Buch-Mockups für Coloring Books (v0.6.0)

Die neuen `book-mockup:*`-Befehle erfassen **ausschließlich den exakt benannten Shop-Bereich `Coloring Books`**. Das erste Bild (`rank=1`) wird als vollständiges Cover in eine liegende, um 8° gedrehte Paperback-Ansicht von oben mit sichtbaren Papierkanten und Bindungsfalz eingesetzt. Hintergrund ist die eigene helle Tischplatte mit bunten Stiften am Rand (`assets/book-mockup-table.jpg`). Das Cover wird proportional eingesetzt, nicht neu gezeichnet oder beschnitten. Ausgabe: 2400 × 2400 Pixel.

Das erste Listing-Bild muss ein einzelnes Frontcover zeigen: Wenn es bereits eine Raumszene, Vorder- und Rückseite nebeneinander oder mehrere Seiten zeigt, würde das ganze Bild als Cover eingesetzt. Prüfe deshalb die lokalen Vorschauen. Die dargestellte Buchdicke ist eine dekorative Vorlage und wird nicht aus einer tatsächlichen Seitenzahl berechnet. Für digitale Produkte wird „PRINTABLE COLORING BOOK · DIGITAL DOWNLOAD“ ergänzt; sonst „COLORING BOOK · COVER PREVIEW“.

```bash
# Ein Listing testen, echte ID einsetzen:
npm run book-mockup:prepare -- --listing 123456789 --dir out/books-test
# Oder alle aktiven Artikel und Entwürfe in Coloring Books:
npm run book-mockup:prepare -- --state active,draft --dir out/books-alle
# Vorschauen prüfen und zunächst ein Bild hinzufügen:
npm run book-mockup:apply -- --dir out/books-alle --limit 1
# Dann alle übrigen hinzufügen:
npm run book-mockup:apply -- --dir out/books-alle
```

Ohne `--state` werden alle Zustände berücksichtigt. Standardordner ohne `--dir`: `out/book-mockup`. Die ursprünglichen Listing-Bilder bleiben vollständig erhalten: Das Buch-Mockup wird **zusätzlich an Position 1** eingefügt, das bisherige Hauptbild rückt auf Position 2. Bei 20 vorhandenen Bildern wird nicht hochgeladen und nichts gelöscht. Alle bisherigen Bild-IDs werden geprüft, auch wenn Etsy doppelte Rangwerte für neue und alte Hauptbilder liefert.

```bash
# Unsicheren Upload-Ausgang prüfen, ohne Bilder zu ändern:
npm run book-mockup:reconcile -- --dir out/books-alle
# Neu hinzugefügte Buchbilder entfernen; Originale bleiben erhalten:
npm run book-mockup:restore -- --dir out/books-alle
```

Backups und eigenes `kind=book-mockup`-Manifest liegen im Ausgabeordner. Poster-Mockup-Manifeste sind dafür nicht gültig. Bereits erfolgreiche Einträge werden beim erneuten Apply im selben Ordner übersprungen. Die Prüfung liest die Galerie bei Bedarf mehrfach, ohne den Upload zu wiederholen. Für neue Vorbereitungsläufe andere Ordner verwenden; bereits hinzugefügte Buchansichten werden nicht optisch erkannt und würden nochmals als Cover verwendet. Kein erneuter Prepare-Lauf auf schon bearbeitete Artikel, bevor diese zurückgesetzt oder aus der Auswahl entfernt wurden.

Bereits markierte Cover behalten ihr Wasserzeichen. Die bisherigen Watermark-Befehle sind weiterhin auf `Poster`/`Poster-Digital` beschränkt und erfassen Coloring Books nicht. Die neuen Buch-Befehle verändern keine Preise, Texte, Listing-Zustände oder Käufer-Download-Dateien.

```bash
npm run typecheck
npm run test:book-mockup
```

### Buch-Hintergrund: Tischplatte mit Stiften

Für Buch-Mockups `src/book-mockup-image.ts` und `assets/book-mockup-table.jpg` übernehmen. Poster-Mockups verwenden weiterhin ihre bisherige Wand-/Bodenszene. Bereits vorbereitete Buch-JPGs bleiben unverändert; neue Vorschauen in einem neuen Ordner erstellen. Bereits eingefügte Buchbilder vor einer erneuten Vorbereitung mit dem alten Manifest zurücksetzen, sonst entsteht eine weitere Buchansicht aus einem vorhandenen Mockup. Die Tischplatte wurde mit Imagegen erzeugt: quadratische Draufsicht auf helles warmes Holz, farbige Buntstifte nur am äußeren Rand, freie Mitte, sanftes Tageslicht, illustrativer Stil, keine Bücher, Texte oder Logos.

### Größere Buchansicht

Die Buchansicht ist jetzt um 15 % größer. Die neue Tischplattenvorlage legt die Stifte eng an die äußeren Ecken und Kanten, damit mehr Platz für das Cover bleibt. Hintergrund und Hinweis werden nicht mit vergrößert. Zum Aktualisieren `src/book-mockup-image.ts` und `assets/book-mockup-table.jpg` übernehmen und neue Vorschauen in einem neuen Ordner erstellen.

## Einen neuen Artikel vollständig bearbeiten

```bash
npm run article:process -- --listing 123456789
# Eigene Wasserzeichen-Stärke für Poster:
npm run article:process -- --listing 123456789 --opacity 0.40
```

Der Befehl lädt Bilder direkt hoch. `Coloring Books`: nur Buch-Mockup vorbereiten und zusätzlich vorne einfügen. `Poster`/`Poster-Digital`: zuerst alle Galerie-Bilder mit Wasserzeichen ersetzen, danach das jetzt markierte Hauptbild in den Rahmen einsetzen und als zusätzliches erstes Bild einfügen. Damit trägt auch das Rahmenbild das Wasserzeichen; es wird kein zweites darübergelegt. Die Position des Schriftzugs im fertigen Rahmenbild folgt dem darin eingesetzten Cover. Andere Shop-Bereiche werden abgewiesen.

Pro ID liegen Backups, Stufen-Manifeste und Einstellungen unter `out/article-ID`. Alternativ `--dir out/mein-artikel` angeben. Wiederholungen mit derselben ID, denselben Einstellungen und demselben Ordner überspringen erfolgreich bearbeitete Schritte; unklare Mockup-Uploads werden ausschließlich lesend abgeglichen. Unklare Watermark-Uploads führen zum Stopp. Bereits zurückgesetzte Stufen werden nicht automatisch neu angewendet. Nicht in einem neuen Ordner auf bereits bearbeitete Listings laufen lassen, sonst drohen doppelte Wasserzeichen und Mockups. Dieser Ablauf ist für neue, noch nicht bearbeitete Artikel gedacht. Ein Fehler zwischen Stufen kann bereits abgeschlossene Änderungen auf Etsy hinterlassen; der Befehl ist keine Transaktion.

Wichtig: Die ältere Empfehlung „erst Mockup, dann Watermark“ gilt für den separaten Batch-Ablauf. Der neue Artikel-Befehl verwendet ausdrücklich die gewünschte Reihenfolge **Watermark → Mockup**. Bilder und Listing-Zustand sollten während des Laufs nicht parallel geändert werden. Da der neue Befehl direkt hochlädt, eine passende erste Cover-/Posteransicht im Listing verwenden. Die bestehenden separaten Prepare-Befehle bleiben für lokale Vorabprüfung verfügbar.

## Neue digitale Poster aus Bild + Text

Einen Eingabeordner mit genau einer JPG- oder PNG-Bilddatei und genau einer Beschreibung als `.txt` oder `.md` übergeben. Die Dateinamen müssen nicht übereinstimmen. Die Suche erfolgt direkt im Ordner, ohne Unterordner. Bei fehlenden oder mehreren passenden Dateien bricht das Script mit einer verständlichen Meldung ab.

Beispielinhalt:

- `wald.jpg` (auch `.jpeg` oder `.png`, Groß-/Kleinschreibung egal): das Motiv, das zugleich als Etsy-Artikelbild dient.
- `beschreibung.md` (oder `.txt`): Beschreibung mit beliebigem Dateinamen.

Beispiel für die Textdatei:

```text
Titel: Verträumter Fuchs im Mondwald
Ein kleiner Fuchs in einem verträumten Wald unter dem Mond.
Tags: fuchs poster, mondwald, wald kinderzimmer
```

`Titel:` und `Tags:` sind optional. Ohne diese Angaben verwendet das Script den ersten Satz als Titel und extrahiert Wortpaare aus der Beschreibung als Tags (regelbasiert, ohne externen KI-Dienst). Maximal 140 Titelzeichen und 13 Tags mit jeweils maximal 20 Zeichen. Der Beschreibung wird ein Hinweis auf den digitalen Download und die KI-Erstellung angefügt.

```sh
npm run poster:preview -- --dir ./eingang
npm run poster:draft -- --dir ./eingang
```

Die Vorschau erzeugt lokale Dateien unter `out/new-posters/<motiv>/`, ohne Etsy zu kontaktieren. Der Erstellungsbefehl verarbeitet das Bild und die Beschreibung im übergebenen Ordner und erzeugt einen Etsy-Entwurf. Alternativ zu `--dir ./eingang` kann der Ordner direkt angegeben werden: `npm run poster:preview -- ./eingang`. Bestehende Zugangsdaten und OAuth-Anmeldung werden verwendet.

Vorgaben dieses neuen Ablaufs: **1,49 EUR**, **999 Stück**, Abteilung **Poster-Digital**, Kategorie **Digital Prints**, Sofortdownload. Die Abteilung muss bereits existieren; die Shop-Währung wird vor Erstellung auf EUR geprüft. Die bisherigen Konvertierungsbefehle behalten ihre Konfiguration.

Die separate Druckdatei ist ein geschärftes JPG mit **7087 × 9449 Pixeln und 300 dpi** für etwa **60 × 80 cm**. Abweichende Seitenverhältnisse erhalten weiße Ränder, damit nichts abgeschnitten oder verzerrt wird. Das Ausgangsbild wird unverändert als Artikelbild hochgeladen. Verwende daher ein reines Motiv: Rahmen oder Wasserzeichen im Ausgangsbild werden auch Bestandteil der Druckdatei. Hochskalierung erzeugt keine fehlenden Originaldetails; die Druckqualität hängt vom Ausgangsbild ab. Dateien über Etsys 20-MB-Limit werden vor Erstellung abgewiesen.

**Noch im Etsy-Editor erforderlich:** Unter „Wie wird dieser digitale Inhalt erstellt?“ **„Mit einem KI-Generator“** auswählen und den Entwurf speichern. Die öffentliche Etsy-API stellt dafür aktuell kein dokumentiertes Feld bereit. Ein Beschreibungshinweis ersetzt diese Auswahl nicht. Das Script gibt den Editor-Link aus und speichert den Status `needs_ai_disclosure`; der Artikel wird nicht veröffentlicht.

`listing.json` protokolliert den Erstellungsstatus und die Etsy-ID unmittelbar nach deren Rückgabe. Nach einem Etsy-Versuch blockiert das Script erneute Verarbeitung desselben Motivs, um Duplikate zu verhindern. Bei Fehlern den gespeicherten Entwurf und seine Uploads in Etsy prüfen. Bei Status `creating` kann bereits ein Entwurf existieren, dessen Antwort verloren ging. Die Statusdatei erst nach dieser Prüfung entfernen, wenn eine neue Erstellung wirklich gewünscht ist.

Prüfung: `npm run typecheck` und `npm run test:poster`.

Die Beschreibung wird auf die Downloadangaben (1 JPG, 7087 × 9449 Pixel, 300 dpi, 3:4 Hochformat) und Druckgrößen (60 × 80, 30 × 40 und 45 × 60 cm) geprüft. Fehlende Downloadangaben werden als englische Liste mit „Your digital download includes:“ ergänzt. Fehlen Druckgrößen, wird der Satz „Prepared for printing at 60 × 80 cm, or smaller 3:4 sizes such as 30 × 40 cm and 45 × 60 cm“ ergänzt. Bereits erkannte Angaben werden nicht erneut als Listenpunkt angehängt; `x` und `×` sowie Groß-/Kleinschreibung werden berücksichtigt. Die Eingabe-Textdatei bleibt unverändert.

Titel und Tags werden auch als Markdown-Überschriften erkannt, z. B. `**Title**` oder `**Tags**` mit Inhalt in der nächsten nicht leeren Zeile. Ebenso funktionieren `**Titel**`, `**Schlagwörter**`, `## Title` und Überschriften mit Doppelpunkt. Tags können durch Kommas/Semikolons getrennt oder als aufeinanderfolgende Listenpunkte angegeben werden. Die erkannten Felder werden aus der Artikelbeschreibung entfernt.

Bei einem Verbindungsabbruch nach Anlage des Entwurfs: `npm run poster:draft -- --dir ./eingang --resume`. Das Script verwendet die gespeicherte Etsy-ID, prüft den Entwurf und ergänzt nur fehlende Uploads. Ohne gespeicherte ID muss zunächst in Etsy nach dem eventuell angelegten Entwurf gesucht werden. Netzwerkfehler nennen jetzt den betroffenen Aufruf und Fehlercode; Schreibzugriffe werden nicht automatisch wiederholt.

## Gesamtablauf: neues digitales Poster mit Wasserzeichen und Mockup

```sh
npm run poster:create -- --dir ./mein-poster
# Optional anderes Wasserzeichen:
npm run poster:create -- --dir ./mein-poster --text GigglingHome --opacity 0.14
```

Dieser Befehl führt nacheinander aus:

1. Bild und Beschreibung aus dem Ordner lesen, Druckdatei erzeugen und Etsy-Entwurf erstellen.
2. Die Artikelbilder des gerade erstellten Entwurfs mit Wasserzeichen versehen.
3. Das Mockup aus dem bereits mit Wasserzeichen versehenen Artikelbild erstellen und in die Galerie einfügen.

Die hochskalierte Käufer-Download-Datei erhält kein Wasserzeichen und kein Mockup. Preis, Stückzahl und Abteilung entsprechen `poster:draft`; der Artikel bleibt ein Entwurf. Die Auswahl „Mit einem KI-Generator“ muss weiterhin im Etsy-Editor gespeichert werden.

Druckdatei und Erstellungsstatus liegen unter `<eingabeordner>/out/new-posters/<bildname>/`. Die Verarbeitung verwendet darunter `processing/` für Sicherungen und Fortschritt von Wasserzeichen und Mockup. Diese Dateien für eine Fortsetzung behalten.

Nach einem Fehler denselben `poster:create`-Befehl mit denselben Optionen erneut ausführen: Der vorhandene Entwurf wird wiederverwendet, unvollständige Uploads werden über den bisherigen Resume-Ablauf fortgesetzt. Bereits abgeschlossene Verarbeitungsschritte verwenden ihre gespeicherten Statusdateien. Bei einem ungewissen Upload-Ergebnis wird zur Prüfung angehalten, statt blind erneut hochzuladen. Titel und Beschreibung bestehender Entwürfe werden dabei wie bisher nicht neu geschrieben. Direkte Einzelbefehle nicht parallel zum Gesamtlauf ausführen. Nach einem Prozessabsturz `.poster-process-lock` nur entfernen, wenn kein Gesamtlauf mehr aktiv ist.

`poster:create` ist der Gesamtbefehl. Nur den Entwurf ohne Wasserzeichen und Mockup erstellt bei Bedarf `npm run poster:draft -- --dir ./mein-poster`.

### Gedruckte Poster: Preise nach Größe aktualisieren

`poster:prices` bearbeitet ausschließlich physische EUR-Artikel in der Shop-Abteilung **Poster**. Die festen Artikelpreise sind 20,99 € für 30 × 40 cm, 24,99 € für 45 × 60 cm und 30,99 € für 60 × 80 cm. Entsprechende Zollangaben werden ebenfalls erkannt. Versandpreise werden nicht bearbeitet.

```bash
# Vorschau für alle aktiven Poster
npm run poster:prices -- preview

# Preise aller aktiven Poster ändern
npm run poster:prices -- update --confirm

# Optional auch Entwürfe, inaktive, ausverkaufte und abgelaufene Poster einbeziehen
npm run poster:prices -- preview --state all
npm run poster:prices -- update --state all --confirm

# Nur Entwürfe
npm run poster:prices -- preview --state draft
```

Vor dem ersten Schreiben werden alle ausgewählten Varianten geprüft. Unbekannte oder widersprüchliche Größen brechen den Durchlauf ab. SKUs, Bestände, Aktivierung und Bearbeitungsprofile bleiben erhalten. Vorherige Bestände und geplante Änderungen werden unter `out/poster-prices/` gesichert. Ein zwischenzeitlich geänderter Bestand stoppt den Durchlauf; bereits erfolgte Änderungen bleiben bestehen. Nach jedem Update wird der Bestand erneut geprüft. Erneute Aufrufe überspringen bereits korrekte Preise. Gelato-Vorlagen werden dadurch nicht geändert.

Die drei Preise lassen sich einzeln überschreiben; ohne Preisparameter gelten weiterhin 20,99 / 24,99 / 30,99 €. Punkt und Komma sind als Dezimaltrennzeichen erlaubt, maximal zwei Nachkommastellen.

```bash
npm run poster:prices -- preview --price-30x40 20.99 --price-45x60 24.99 --price-60x80 30.99
npm run poster:prices -- update --price-30x40 20.99 --price-45x60 24.99 --price-60x80 30.99 --confirm
```

Die Preisparameter gelten auch mit `--state all` oder `--state draft`.

### Versandländer ausschließen (physische Poster und T-Shirts)

```bash
npm run shipping:exclude -- preview
# Einmalig zusätzliche Etsy-Berechtigung für Versandprofile erteilen:
ETSY_SCOPES="shops_r shops_w listings_r listings_w" npm run auth
npm run shipping:exclude -- apply --confirm
```

Regeln stehen in `config/shipping-exclusions.json`: Shop-Abteilung `Poster` ohne Spanien, `Kids T-Shirts` ohne Frankreich und Spanien. Alle Artikelzustände werden zur Profilzuordnung geprüft. Geteilte Profile außerhalb der Auswahl oder mit widersprüchlichen Regeln führen zum Abbruch. Digitale Artikel werden nicht bearbeitet. Aktuell nicht angebotene Länder werden durch das Kommando nicht freigeschaltet.

Sammelziele „EU“ und „Überall sonst“ werden, soweit erforderlich, durch einzelne Länder mit den bisherigen Preisen und Lieferzeiten ersetzt. Bestehende Länderpreise haben Vorrang. Profile ohne Versand in die ausgeschlossenen Länder bleiben unverändert. Für weltweite Profile werden ISO-3166-Ländercodes und Etsys vorhandener Kosovo-Code KV als Zielkatalog verwendet. Antwortet Etsy für genau das angefragte Land mit HTTP 400 und „The destination country … is not currently supported.“, wird ausschließlich dieses Land übersprungen. Dasselbe gilt für die exakte Etsy-Antwort „Value for destination_country_iso must be a valid ISO Country Code: …“, sofern der angefragte Code im mitgelieferten Länderkatalog steht; Etsy unterstützt nicht jeden dort gültigen ISO-Code. Die bestätigten Ablehnungen stehen in `out/shipping/unsupported-countries.json`. Sie gelten nicht als verfügbare Versandziele bei der Nachprüfung. Andere API-Fehler (auch andere 400-Antworten), Rate-Limits und Netzwerkfehler stoppen weiterhin vor dem Entfernen der ursprünglichen Sammelziele des betroffenen Profils. Bereits angelegte gleichpreisige Länderzeilen können bestehen bleiben und werden bei erneutem Aufruf erkannt. Nach Teilfehlern erneut `preview` aufrufen.

Die Vorschau mit sämtlichen Länderzeilen liegt unter `out/shipping/preview.json`. Vor Änderungen wird eine Sicherung `out/shipping/backup-*.json` gespeichert. Das Kommando verifiziert die Länderausschlüsse und die übrigen Länderpreise nach jedem Profil. Es gibt keine automatische globale Rückabwicklung bei einem Teilfehler. Profiländerungen gelten für sämtliche verknüpften Artikel. Vor späterer Verwendung der Profile für andere Produkte die Regeln prüfen.

Gelato-/Printify-Synchronisationen können die Etsy-Profile später wieder ändern oder neue Profile zuweisen. Das Kommando deshalb danach erneut im Vorschaumodus ausführen. Die Anbieter-Vorlagen selbst werden nicht geändert.


#### Automatische Versandprüfung im Artikelablauf

`article:process` prüft physische Artikel in `Poster` vor der Bildverarbeitung automatisch und wendet die Länderregeln an. Fehler stoppen den Ablauf; der offene Schritt steht im Verarbeitungsordner in `shipping-check.json`. Derselbe Artikelbefehl setzt nach Behebung fort. Digitale Downloads (`poster:create` / `poster:draft`, Abteilung `Poster-Digital`) brauchen keine Versand-Länderausschlüsse und werden nicht als physische Poster behandelt.

Gezielt nur das zugeordnete Profil eines Artikels prüfen/anpassen:

```bash
npm run shipping:exclude -- preview --listing 123456789
npm run shipping:exclude -- apply --confirm --listing 123456789
```

Die Profiländerung gilt weiterhin für alle zugeordneten Artikel. Geteilte Profile mit widersprüchlichen Regeln werden abgelehnt. `--expected-shop ID` ermöglicht einem aufrufenden Projekt eine zusätzliche Shop-Prüfung.


GPSR-Herstellerkontakt für einen bestätigten Gelato-Artikel (Beschreibung, nicht die separaten Editorfelder):

```sh
npm run gpsr:manufacturer -- --listing 4597600781 --contact /Users/stefan.marx/Documents/privat/gelato/giggle-publisher/.private/product-contact.json
```

Ohne `--apply` nur Vorschau. Mit `--apply` wird nach Shop-/Produktionspartnerprüfung ausschließlich die Beschreibung ergänzt und ein Backup unter `out/gpsr` angelegt. Kein Publish, keine erfundenen Sicherheitsangaben. Der Gelato-Publisher ruft dies bei create/resume nach fertiger Etsy-Übertragung automatisch auf.
