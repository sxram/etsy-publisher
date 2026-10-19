# Validierung — 7. Oktober 2026

Lokal ausgeführt mit Node.js 25.9.0 und npm 11.12.1:

- Installation aus öffentlicher npm-Registry, reproduzierbares package-lock.json.
- npm run typecheck: erfolgreich, einschließlich Test- und Smoke-Skripten.
- npm run build: erfolgreich.
- npm test: 2 Tests erfolgreich, 0 Fehler; echter lokaler HTTP-/MCP-Transport.
- Gebauten dist/index.js separat gestartet; scripts/smoke.ts erfolgreich:
  health_check → status ok; hello → korrekte Begrüßung.
- Docker-Compose-Konfiguration mit gesetzter Beispieldomain: erfolgreich validiert.
- npm-Installation meldete 0 bekannte Vulnerabilities zum Prüfzeitpunkt.

Noch nicht geprüft: Laufzeit unter Node.js 24, Docker-Image-Build/-Laufzeit,
öffentlicher Host, DNS/TLS, Verbindung aus ChatGPT. Docker-Daemon war innerhalb
der eingeschränkten Umgebung nicht zugänglich; es wurde kein Container gestartet.
Die Container-Vorlage ist daher vorbereitet, keine verifizierte Bereitstellung.

Die Tests benötigen einen lokalen Listening-Port. In dieser Codex-Umgebung wurde
hierfür die zusätzliche Ausführungsberechtigung genutzt.
