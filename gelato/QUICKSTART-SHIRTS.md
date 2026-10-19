# Quickstart: T-Shirt aus einem Motivordner erstellen

Für das eingerichtete Profil **Gildan 5000B Kinder-T-Shirt**.

## 1. Projekt öffnen

```bash
cd /Users/stefan.marx/Documents/privat/gelato/giggle-publisher
```

Voraussetzung: `.env`, Gelato-Vorlage, Dropbox-Anmeldung und Etsy-Zugang sind bereits eingerichtet. Preise, angebotene Farben/Größen und Basis-Mockups in der Gelato-Vorlage pflegen und speichern.

## 2. Motivordner anlegen

Genau **ein JPG/JPEG/PNG** und **eine TXT/MD-Datei** direkt im Ordner ablegen:

```text
mein_motiv/
  bild.png
  beschreibung.md
```

Beispiel für `beschreibung.md`:

```markdown
**Title**
Space Squad Kids T-Shirt | Cute Alien Shirt

**Tags**
kids shirt, alien shirt, space animals,
galaxy shirt, space gift

**Description**
A colourful space adventure for little explorers.

Your detailed product description goes here.
```

- Titel und Tags werden aus der Datei gelesen, nicht automatisch erfunden.
- `Title:` / `Titel:` und `Tags:` funktionieren ebenfalls.
- Tags dürfen mehrzeilig sein: maximal 13 Tags, jeweils maximal 20 Zeichen.
- Zwischen den Tags und der Beschreibung eine Leerzeile lassen.

## 3. Lokal prüfen

Druckbild und Artikeltext vorbereiten, **ohne Gelato-/Etsy-Artikel anzulegen**:

```bash
npm run gelato:preview -- --dir ./mein_motiv
```

Optional die Farbmockups separat lokal erzeugen:

```bash
npm run gelato:mockups -- --dir ./mein_motiv
```

## 4. Artikel erstellen

**Nur einmal pro Motivordner ausführen:**

```bash
npm run gelato:create -- --dir ./mein_motiv
```

## 5. Übertragung und offene Schritte fortsetzen

Gelato verarbeitet und überträgt den Artikel im Hintergrund. Wenn die Etsy-ID noch fehlt oder ein Schritt offen ist:

```bash
npm run gelato:resume -- --dir ./mein_motiv
```

Diesen Befehl bei Bedarf später erneut ausführen. Er legt für einen gespeicherten Auftrag keinen zweiten Gelato-Artikel an. Der Gelato-Status `active` bedeutet hier, dass die Übertragung fertig ist; den tatsächlichen Etsy-Entwurfs-/Veröffentlichungsstatus separat prüfen.

**Für unseren vorhandenen Artikel:**

```bash
npm run gelato:resume -- --dir ./motiv_gcosmos
```

## Was der Ablauf automatisch macht

- Bild, Titel, Tags und Beschreibung aus dem Motivordner lesen.
- Titelkommas durch `|` ersetzen und den Shirt-/Modellzusatz ergänzen.
- Fehlende Standardpunkte zur Produktbeschreibung ergänzen.
- Druckbild aufbereiten: längste Kante als Ziel 3800 Pixel, 300-dpi-Metadaten, Schärfung beim Hochskalieren und Zielgröße maximal 10 MB. Falls nötig wird stärker komprimiert bzw. verkleinert; die effektive Druckauflösung hängt von der Gelato-Platzierung ab.
- Weiß **nicht** transparent machen und das Bild **nicht** zuschneiden.
- Nicht-rechteckige Motive erkennen und den Hinweis zum gedruckten weißen Hintergrund ergänzen.
- Alle Vorlagenfarben behalten; Größen ohne vollständige Farbkombinationen gegebenenfalls weglassen und melden.
- Druckbild zu Dropbox hochladen und einen für Gelato abrufbaren Link erzeugen.
- Produkt bei Gelato aus der gespeicherten Vorlage anlegen und eine nicht sichtbare Übertragung zu Etsy anfordern.
- Nach fertiger Übertragung die bestätigten Herstellerkontaktdaten in der Etsy-Beschreibung ergänzen.
- Etsy-Versandprofile auf die konfigurierten Länderausschlüsse prüfen und bei Bedarf anpassen; für `Kids T-Shirts` derzeit Frankreich und Spanien ausschließen.
- Farbübersichten für die angebotenen Farben erzeugen und bei Etsy ergänzen: **ohne Weiß, bis zu sechs Shirts pro Übersicht**. Aktuell 6 + 5 Farben.
- Vorhandene Etsy-Bilder erhalten und erneute identische Uploads vermeiden.
- Kategorie, Shop-Abteilung und Beschreibung bei eigenen Etsy-Entwürfen nachbearbeiten, **wenn der separate Etsy-Zugang im Publisher aktiviert ist**. Andernfalls wird dieser offene Schritt gemeldet.

## Vor dem Veröffentlichen in Etsy prüfen

- Preis, Versandkosten, Größen/Farben und Bilder.
- Kategorie Kinder-T-Shirts, Shop-Abteilung `Kids T-Shirts` und Produktionspartner Gelato.
- Herstellungsweise und verwendete Werkzeuge.
- Die separaten **GPSR-Hersteller- und Sicherheitsfelder**: Diese werden nicht per API gesetzt. Der Herstellerblock in der Beschreibung ersetzt keine Prüfung der übrigen Produktangaben.
- Rückgabe- und Shop-Richtlinien.

Das Script schaltet den Etsy-Entwurf nicht selbst auf öffentlich. Bei einem bereits veröffentlichten Artikel werden die autorisierten Ergänzungen dort direkt sichtbar.

## Wichtig beim Wiederholen

- Bei gespeichertem Auftrag immer `gelato:resume` statt erneut `gelato:create` verwenden.
- `out/` nicht löschen: Dort liegen Auftragsstatus und Uploadjournale für die Duplikatvermeidung.
- Bild oder Beschreibung während eines laufenden Auftrags nicht ändern; sonst stoppt die Eingabeprüfung.
- **Ash und Dark Heather fehlen weiterhin in den Farbübersichten**, bleiben aber in der Gelato-/Etsy-Farbauswahl erhalten, sofern die Vorlage sie anbietet.
- Erzeugte Druckbilder und Status: `<motiv>/out/gelato/`; Farbmockups und Uploadjournal: `<motiv>/out/color-mockups/`.
