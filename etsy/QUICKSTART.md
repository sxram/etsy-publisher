# Etsy – Quickstart

Alle Befehle aus diesem Ordner (`etsy/`) ausführen. Einmalig `npm ci`; Etsy-Zugang steht in `.env`.

## Physische Poster: alle Preise nach Größe ändern

Beträge sind **Beispiele in EUR** – durch deine gewünschten drei Preise ersetzen. Nur physische Artikel aus der Shop-Abteilung **Poster** werden bearbeitet; digitale Poster bleiben unberührt.

Zuerst Vorschau (keine Preisänderung):

```sh
npm run poster:prices -- preview --price-30x40 20.99 --price-45x60 24.99 --price-60x80 30.99
```

Danach dieselben Preise speichern:

```sh
npm run poster:prices -- update --price-30x40 20.99 --price-45x60 24.99 --price-60x80 30.99 --confirm
```

- Standard: **alle aktiven Poster** gleichzeitig.
- Nur Entwürfe: bei beiden Befehlen `--state draft` ergänzen.
- Alle Status einschließlich Entwürfen, inaktiven, abgelaufenen und ausverkauften Artikeln: `--state all` ergänzen. Artikel werden dadurch nicht veröffentlicht oder reaktiviert.
- Alle drei Preise angeben; ausgelassene Parameter verwenden die hinterlegten Standardpreise.
- Größen werden anhand der Varianten erkannt. Unbekannte Größen führen vor dem ersten Schreibzugriff zum Abbruch.
- Sicherungen unter `out/poster-prices/`. Bei späterer Gelato-Synchronisierung die Preise erneut prüfen: Dieser Befehl ändert Etsy, nicht die Gelato-Vorlage.

## Verbindung und Artikelübersicht

```sh
npm run whoami
npm run list
npm run posters
```

Bei notwendiger neuer Etsy-Freigabe:

```sh
npm run auth
```

## Digitales Poster aus einem Ordner erstellen

Im Motivordner: genau ein JPG/PNG und eine TXT/MD mit Titel, Tags und Beschreibung.

```sh
npm run poster:preview -- --dir ./mein_motiv
npm run poster:create -- --dir ./mein_motiv
```

- Erstellt einen digitalen Etsy-Entwurf in **Poster-Digital**, einschließlich Druckdatei, Wasserzeichen und Rahmen-Mockup.
- Bei unterbrochenem Gesamtlauf denselben `poster:create`-Befehl mit unverändertem Ordner erneut ausführen; Fortschrittsdateien behalten.
- Der Entwurf wird nicht automatisch veröffentlicht. Fehlende Angaben im Etsy-Editor prüfen.

## Bestehenden Posterartikel nachbearbeiten

`123456789` durch die Etsy-Artikel-ID ersetzen:

```sh
npm run article:process -- --listing 123456789
```

- Prüft bei physischen Postern die Versand-Länderausschlüsse.
- Versieht Artikelbilder mit Wasserzeichen und ergänzt das erste Bild als Rahmen-Mockup.
- Verwendet vorhandene Fortschrittsdateien bei erneutem identischem Aufruf. Bereits über einen anderen Lauf bearbeitete Bilder nicht erneut mit einem neuen Ausgabeordner verarbeiten.
- Ändert den Veröffentlichungsstatus nicht. Sicherungen unter `out/article-123456789/`.

## Versand-Länderausschlüsse

Alle passenden Artikel anhand der Regeln in `config/shipping-exclusions.json`:

```sh
npm run shipping:exclude -- preview
npm run shipping:exclude -- apply --confirm
```

Gezielt für einen Artikel:

```sh
npm run shipping:exclude -- preview --listing 123456789
npm run shipping:exclude -- apply --confirm --listing 123456789
```

Versandprofile können von mehreren Artikeln gemeinsam genutzt werden; Profiländerungen gelten für alle zugeordneten Artikel.

## Physische Gelato-Poster und Shirts erstellen

Diese Erstellung gehört zum benachbarten Ordner **gelato/**:

```sh
cd ../gelato
npm run gelato:poster:preview -- --dir ./mein_poster
npm run gelato:poster:create -- --dir ./mein_poster
npm run gelato:poster:resume -- --dir ./mein_poster
```

Für Shirts siehe `../gelato/QUICKSTART-SHIRTS.md`; für Poster und Einrichtung `../gelato/README.md`. Der Gelato-Ablauf ruft die Etsy-Nachbearbeitung automatisch auf, sobald die Etsy-Übertragung fertig ist.

## Einzelnen Artikel im Chat prüfen

In Codex eingeben, nicht im Terminal:

```text
$etsy-listing-check Prüfe Artikel 123456789 und ergänze fehlende bestätigte Angaben.
```

Prüft GPSR-, Werkzeug- und Herstellungsangaben. Benötigt Safari-Computersteuerung; Entwürfe bleiben Entwürfe. Ohne Artikel-ID werden alle aktiven Artikel und Entwürfe geprüft.
