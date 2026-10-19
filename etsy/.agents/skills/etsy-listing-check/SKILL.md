---
name: etsy-listing-check
description: Prüft Stefans Etsy-Artikel in Safari auf fehlende GPSR-, Werkzeug- und Herstellungsangaben und ergänzt bestätigte Werte. Verwenden für Etsy-Artikelkontrolle und die gezielte Veröffentlichung solcher Korrekturen.
---

# Etsy-Artikel prüfen

Prüfe im Shop GigglingHome diese drei Bereiche im Etsy-Editor:
- GPSR-Hersteller- und Sicherheitsinformationen (Hersteller und Produktsicherheit getrennt prüfen).
- Welche Werkzeuge werden zur Herstellung dieses Artikels verwendet?
- Wie stellt dein Shop diesen Artikel her?

## Umfang und Ausführung

Der Nutzer ist in Safari angemeldet. Verwende die verfügbare Computersteuerung für Safari, nicht den eventuell ausgeloggten In-App-Browser. Initialisiere sie nach ihrer aktuellen Tooldokumentation. Bei fehlender Anmeldung den Nutzer anmelden lassen, keine Passwörter auslesen.

Eine Skill-Auswahl ist eine Arbeitsanweisung, keine technische Berechtigungserweiterung. Beachte die Autorisierung des aktuellen Auftrags: Bei „prüfen“ nur lesen; bei „fehlende Angaben ergänzen und Änderungen veröffentlichen“ fehlende bestätigte Werte speichern und bei aktiven Artikeln aktualisieren. Bereits ausdrücklich autorisierte Aktualisierungen benötigen keine erneute Einzelbestätigung je Artikel. Bei bloßer impliziter Skill-Auswahl ohne Änderungsauftrag zuerst prüfen und für konkrete Änderungen Autorisierung einholen.

Standard: alle aktiven Artikel prüfen; Entwürfe zusätzlich prüfen, wenn alle Artikel angefordert sind, aber als Entwurf speichern. Inaktive, abgelaufene und ausverkaufte Artikel nicht reaktivieren. Neue Entwürfe nur dann veröffentlichen, wenn der Nutzer dies ausdrücklich umfasst; eine allgemeine Anweisung, Korrekturen an Angeboten zu veröffentlichen, umfasst keine zusätzliche kostenpflichtige Erstveröffentlichung von Entwürfen.

## Bestandsaufnahme

Wenn verfügbar, nutze den bestehenden Etsy-API-Zugang im Projekt `/Users/stefan.marx/Documents/privat/etsy-scripts/etsy-poster-to-digital` zum paginierten Auflisten der Artikel und Zuordnen von IDs, Status, Artikeltyp und Produktionspartnern. `src/etsy.ts` bietet getMyShop, getAllShopListings und getListing. Geheimnisse nicht ausgeben. Etsy liefert den Typ häufig in `listing_type`, nicht `type`.

Die drei Editorfelder selbst im Browser lesen: Fehlende öffentliche API-Felder nicht durch interne undokumentierte Endpunkte ersetzen. Ein Herstellerblock in der Beschreibung beweist nicht, dass das separate GPSR-Feld gefüllt ist.

Prüfe vor Änderungen den angemeldeten Shop. Erstelle ein lokales Protokoll im aktuellen Projekt unter `out/etsy-listing-check/` mit Artikel-ID, Titel, Status, gelesenen Werten, geplanten und tatsächlich bestätigten Änderungen sowie offenen Punkten. Keine Kundendaten oder Zugangsschlüssel aufnehmen. Bei Fortsetzung gespeicherte Ergebnisse als Hinweis nutzen und den aktuellen Artikel erneut lesen.

## Bestätigte Daten und Grenzen

Hersteller für eindeutig Gelato-produzierte physische Artikel, auf ausdrückliche Anweisung des Nutzers bestätigt:

Stefan Marx
Friedrichsberger Str. 5
10243 Berlin
Germany
Email: stefanmarx.de@gmail.com

Gelato-Quelle: https://support.gelato.com/en/articles/10272622-general-product-safety-regulation-gpsr-in-the-eu

Vor Anwendung aktuelle Quelle prüfen. Diese Regel nicht auf Printify oder unbekannte Produktionspartner übertragen. Druckdienstleister, Hersteller und EU-verantwortliche Person sind unterschiedliche Rollen. Vorhandene Herstellerangaben nicht überschreiben, nur fehlende bestätigte Daten ergänzen.

Produktbezogene Warnungen, Altersangaben und Sicherheitsinformationen sind bislang nicht bestätigt. Nicht ausdenken und nicht mit allgemeinen Sätzen wie „sicher“ oder „keine Warnungen erforderlich“ füllen. Nutze konkrete Produktunterlagen; unklare Fälle protokollieren und beim Nutzer gebündelt klären. Kein GPSR-Feld nur zur Erfüllung einer Pflichtanzeige mit irrelevanten Pflegehinweisen füllen. Anwendbarkeit für digitale Artikel gesondert prüfen, keine physische Gelato-Regel pauschal übernehmen.

Werkzeuge: KI-Generator nur auswählen, wenn die KI-Erstellung des betreffenden Motivs durch Nutzeraussage oder projektspezifische Quelle belegt ist. Nicht vom Aussehen des Motivs ableiten. Andere Werkzeuge nur nach tatsächlichem Herstellungsprozess auswählen.

Herstellungsweise: Bei bedruckten fertigen Gildan-Shirts ist die frühere gewünschte Auswahl „Wird von Grund auf neu hergestellt“ kein belastbarer allgemeiner Standard. Zuerst die verfügbaren Etsy-Optionen und ihre Erläuterung lesen; nur eine sachlich passende, belegte Auswahl übernehmen. Wenn die Zuordnung unklar ist, konkrete Optionen dem Nutzer zur Entscheidung vorlegen, statt selbst eine unzutreffende Angabe zu speichern.

## Browseränderungen und Abschluss

Artikel einzeln anhand der ID öffnen. Nur fehlende Angaben bearbeiten. Bestehende Angaben nicht stillschweigend ändern. Vor dem Speichern kontrollieren, dass keine anderen Felder, Preise, Varianten, Fotos, Lieferprofile oder Texte geändert wurden; vorbestehende ungespeicherte Änderungen nicht mitveröffentlichen.

Wenn ein Artikel teilweise unklare Angaben hat, bestätigte unabhängige Ergänzungen dürfen gespeichert werden; den Artikel anschließend ausdrücklich als unvollständig protokollieren. Nicht als vollständig geprüft melden.

Bei aktiven Artikeln die vorhandene Funktion zum Speichern/Veröffentlichen der Änderungen benutzen, ohne den Artikel neu anzulegen. Danach Editor erneut öffnen und gespeicherte Werte nachlesen. Bei Entwürfen Entwurf speichern. Bei unbekanntem Speicherergebnis zuerst nachlesen, nicht blind erneut veröffentlichen. Nach zwei gleichartigen Fehlern beim selben Artikel den offenen Punkt protokollieren und mit unabhängigen Artikeln fortfahren; bei falschem Shop oder globalem Login-/Speicherproblem gesamten Schreibablauf stoppen.

Am Ende Anzahl geprüft, ergänzt, unverändert und unvollständig berichten, mit Links/IDs der offenen Artikel. Änderungen an Live-Artikeln von bloß vorbereiteten Werten unterscheiden. Beim Erstellen oder Installieren dieses Skills noch keine Artikel bearbeiten; erst bei einem gesonderten Ausführungsauftrag.
