# Erweiterung

health_check und hello sind immer aktiv. Im lokalen Etsy-Modus kommt
list_etsy_drafts hinzu: PKCE-Freigabe über npm run etsy:connect, Token-Refresh,
konfigurierter Shop und Eigentümerprüfung. Keine Etsy-Schreibaktionen.

Vor Remote-Zugriff auf private Daten MCP-OAuth und Benutzerzuordnung implementieren.
Danach können update_etsy_listing mit präzisen erlaubten Feldern und
create_gelato_product mit Idempotenz ergänzt werden. Annotations sind Hinweise,
keine Zugriffskontrolle. Keine Secrets in Logs, Metadaten oder Tool-Antworten.
