# Tests am 5. November 2026

Geprüft mit den echten Dateien aus `data/` (Stand nach dem Kurslauf), Headless Chrome, Viewport 390×844, User-Agent iPhone Safari 18. Ein Lauf im normalen Tab, einer mit `navigator.standalone` und `display-mode: standalone`.

## Checkliste

- [x] Sechs Tabs öffnen und haben Text. Die Adresse bleibt `/Justy-gtr-app/`.
- [x] 67 Detailansichten (Kurse, Warum, Termine, Posts, Schwarm, Kosmos, alle Punkte unter Mehr). Jede zeigt Inhalt und den Knopf **Schließen** oben links. Danach ist die Ansicht zu und die App noch da.
- [x] Umschalter Kalender Unternehmen/Extern, Post-Filter, Chart-Symbole, Zeiträume, Langfrist-Brille.
- [x] Externer Link (X, Quellen, Livestream) verlässt das App-Fenster nicht. Wenn der Browser kein neues Fenster zulässt, kommt die Karte „In Safari öffnen“ mit Schließen.
- [x] Unbekannte Aktion zeigt eine Fehlerkarte mit Schließen, kein leeres Schwarz.
- [x] Fünf Taps auf das Zeichen: Nachtfahrt, Schließen bringt zurück.
- [x] Fünfmal Gegenteil: der Hinweis erscheint.
- [x] Rakete im aufgeklappten Starship-Block startet die Animation.
- [x] Standalone blendet den Installationshinweis aus. Dieselben Wege zurück funktionieren.
- [x] `node --test scripts/market.test.mjs`

Höchststand ist mit den aktuellen Kursen nicht fällig: keiner liegt auf `recordHighEur`. Der Pfad bleibt im Code und gilt nur für echte neue Hochs.
