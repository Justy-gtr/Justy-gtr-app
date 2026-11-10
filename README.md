# Justy GT-R

Persönliches Recherche-Cockpit für Justy. Im Mittelpunkt steht SpaceX (SPCX, Nasdaq, Börsengang 12. Juni 2026 zu 135 US-Dollar), danach Tesla, dazu das engere Musk-Umfeld und Rocket Lab als Vergleich. Die App ist eine statische Web-App für das iPhone. Sie liest JSON-Dateien, speichert nichts auf einem Server und ersetzt keine Beratung.

**Keine Anlageberatung.** Nur Recherche und Bildung.

Adresse, sobald GitHub Pages läuft: <https://justy-gtr.github.io/Justy-gtr-app/>

## Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen. Chrome auf dem iPhone kann keine Home-Bildschirm-App anlegen.
2. Auf das Teilen-Symbol tippen.
3. **Zum Home-Bildschirm** wählen.
4. **Hinzufügen** tippen.
5. Die App danach vom Home-Bildschirm starten, nicht aus dem Safari-Tab.

Beim ersten Öffnen erinnert die Startseite daran. Die App merkt sich das Wegklicken auf diesem Gerät.

## Bedienung

Die sieben Bereiche liegen nebeneinander: Heute, Kalender, Posts, Schwarm, Deutschland, Analyse, Mehr. Die Leiste unten teilt die Breite gleichmäßig. Waagerecht wischen wechselt den Bereich, die Leiste springt direkt hin.

Eine Karte öffnet die Detailansicht. Oben links steht **Schließen**, zusätzlich geht ein Wisch vom linken Rand zurück. Externe Links, zum Beispiel Posts auf X und Quellen, öffnen Safari und ersetzen die App nicht. Mit der Tastatur schließt Escape die Ansicht, die Pfeiltasten wechseln den Bereich.

Auf dem iPhone im Vollbild nutzt die App die sicheren Ränder und scrollt nur innen, damit die Seite nicht am Gummiband des Browsers hängt.

## Was die Bereiche zeigen

- **Heute:** Begrüßung, die drei Kurse in Euro, der nächste Termin und Karls wichtigste Notiz. Der Rest liegt in kurzen aufklappbaren Blöcken.
- **Kalender:** Umschalter Unternehmen / Extern. Jeder Termin hat Datum, Wahrscheinlichkeitsbalken, Begründung und Quellen.
- **Posts:** Kurzfassungen auf Deutsch, Link zum Original, Stimmungsbogen für SpaceX und Tesla.
- **Schwarm:** Karl sagt je Aktie, ob er zuversichtlicher oder skeptischer ist als der Schwarm, mit kurzem Einwand. Darunter Ticker, Erwähnungen und die Trefferquote, sobald sie vorliegt. Keine Kauf- oder Verkaufstipps.
- **Deutschland:** Xetra-Namen mit großem Auf und Ab zwischen 9:00 und 10:30 Uhr, die bei Trade Republic mit Hebel handelbar sind. Kurs, Tagesveränderung, Sparkline und die mittlere Morgen-Schwankung. Keine Kauf- oder Verkaufstipps.
- **Analyse:** Umschalter Kerzen oder Chart, die Wahl bleibt auf diesem iPhone. Ein Tipp auf einen Kurs unter Heute öffnet Analyse. Chart ist die schwarze Kurslinie mit kleinem Zeichen, Name und großem Euro-Kurs. Daneben Dreieck und Veränderung der gewählten Spanne. Spannen: 1T, 1W, 1M, 1J und Max, der gewählte Text grün. Eine Linie, grün wenn die Spanne steigt, rot wenn sie fällt. Gepunktete Waagerechte am Startkurs, wenige Preise rechts, Datum unten. Ziehen zeigt Datum, Uhrzeit, Kurs und Veränderung; die Zeile bleibt stehen, der Chart springt nicht. Darunter „Warum diese Bewegung?“ und die Muster-Karte, nur diese Aktie. Kerzen bleiben 5 Min, 15 Min, 4 Std, 1T, 1 Std, 1W, 1M, 6M, 1J und Max. 1 Std sind Stundenkerzen der letzten Handelstage, mit Vorbörse und Nachbörse, wenn die Reihe sie hat. 1W nimmt Stundenkerzen, sonst 30-Minuten-Kerzen. 1M nimmt 4-Stunden-Kerzen des Monats, wenn die Reihe reicht. 4 Std bleibt die gespeicherte 4-Stunden-Reihe, nicht eine einzelne Sitzung. Der Name einer Linie steht links, der Preis als Plakette an der rechten Achse. Linien nur, wenn die Form in der Reihe liegt. Dieselbe Muster-Karte, wieder nur diese Aktie. Unten steht der mittlere Tagesverlauf je Wochentag, von 07:00 bis 23:00 Uhr Berlin. Keine Kauf- oder Verkaufstipps.
- **Mehr:** Insider, Treffer-Check, Versprechen, Was-wäre-wenn, Ruhe-Modus, Produktion, erste Prinzipien, Glossar, Tagesfrage, Briefing, Wochenrückblick, Meldungen.

„Warum?“ an einem Kurs öffnet die kurze Einordnung. „Gegenteil“ zeigt das stärkste Gegenargument. Die Tagesfrage liegt auf diesem iPhone; Justy und Karl bekommen nur Punkte, wenn beide geantwortet haben und ein Ergebnis hinterlegt ist.

Der Ruhe-Modus erscheint auf der Startseite, wenn ein echter Euro-Kurs am Tag zwei Prozent oder mehr verliert. Beispieldaten lösen ihn nicht aus.

## Daten

Alle Inhalte liegen unter `data/` als JSON. Das Schema steht in [docs/DATA.md](docs/DATA.md). Solange `meta.json` das Feld `dataMode` auf `beispieldaten` hat, zeigt die App ein Beispiel-Schild. Die mitgelieferten Einträge sind Platzhalter, damit die Oberfläche nicht leer ist.

Ein Assistent kann die Recherche-Dateien per GitHub-API nach `main` schreiben. Der Kurs-Workflow fasst die Marktfelder in `prices.json`, `alerts.json` und die Preisfelder in `meta.json` an und lässt Begründungen stehen.

Nach einem Commit auf `main` veröffentlicht der Workflow **Seiten** die App. Ein Kurs-Update, das die Dateien wirklich ändert, stößt dieselbe Veröffentlichung an. Commits aus der Action lösen von sich aus keinen `push`-Lauf aus, deshalb ruft der Kurs-Workflow die Seiten direkt auf.

## Kurse

Der Workflow **Kurse** läuft über GitHub Actions, ohne API-Schlüssel.

Zeiten in Europe/Berlin, auch über die Sommerzeit hinweg:

- montags bis freitags von 05:00 bis 22:15, auch wenn der Cron später startet
- zusätzlich, solange in New York Vorbörse, Handel oder Nachhandel läuft (04:00–20:00 Uhr New York, plus 30 Minuten), auch nach 22:15 Berlin und in den Freitagabend hinein
- samstags und sonntags nur 09:00, 14:00 und 20:00, mit 45 Minuten Spielraum danach

GitHub plant nur in UTC. Der Laufplan deckt deshalb MEZ und MESZ ab, und `scripts/schedule.mjs` lässt den Abruf nur im passenden Berliner Fenster zu. Werktags startet der Cron alle fünf Minuten. Jede Minute wäre zu viel für die Git-Historie. Samstag und Sonntag bleiben bei den festen Zeiten. Von Hand starten geht über „Run workflow“ und ignoriert das Fenster.

Das iPhone kann die Yahoo-Schnittstelle nicht selbst lesen, weil die Antwort kein CORS-Freigabe-Feld schickt. Die App bleibt bei `prices.json`. Liegt Heute oder Charts offen und der Handel läuft, holt sie diese Datei etwa einmal pro Minute neu. Ein stilles **Live** erscheint, wenn der gespeicherte Stand jünger als 15 Minuten ist. Kommt nichts Neues an, bleibt die letzte Linie stehen. Der große Kurs ist weiter der reguläre Schluss, nicht der letzte Minutenpunkt.

Quellen, kostenlos über die Chart-Schnittstelle von Yahoo Finance:

- **TSLA:** Xetra `TL0.DE`, Kurs direkt in Euro. Fallback Frankfurt `TL0.F`.
- **RKLB:** Frankfurt `6RJ0.F` in Euro. Ein Xetra-Listing war nicht zuverlässig zu finden. Ist die Intraday-Reihe dort zu dünn, kommt der Tagesverlauf von der Nasdaq und wird umgerechnet.
- **SPCX:** kein brauchbares Euro-Listing. Nasdaq-Kurs in US-Dollar, geteilt durch EURUSD (`EURUSD=X`, US-Dollar je ein Euro).

Jedes Papier merkt sich in `eurMethod`, ob der Euro-Kurs direkt von einem deutschen Platz kommt oder umgerechnet ist. Nach Xetra- oder Frankfurt-Schluss hängt der Tagesverlauf die Nasdaq an, inklusive Vorbörse und Nachbörse. Der reguläre Schluss bleibt der große Kurs. Daneben stehen Hoch und Tief, und wenn es Drucke gibt, ein zweiter Kurs: Vorbörse, US-Handel oder Nachhandel. Die Nasdaq-Notiz wird mit demselben EURUSD-Kurs in Euro gerechnet. Yahoo liefert dafür keinen eigenen Overnight-Schluss und kein amtliches Hoch/Tief; genommen wird der letzte Kerzenschluss und die Spanne dieser Kerzen. Bewegt sich der Euro-Kurs am Tag um mindestens 2 Prozent, schreibt der Workflow einen Eintrag in `data/alerts.json` mit Zeitstempel und `notified: false`. Dasselbe Papier am selben Berliner Tag wird nicht doppelt angelegt; `notified` bleibt, wie es ist. Gibt es nichts Neues, gibt es auch keinen Commit. Schlägt der Abruf fehl, bleiben die letzten Dateien stehen und der Lauf endet mit einer Warnung statt die Daten zu leeren. Derselbe Lauf schreibt höchstens einmal am Berliner Tag `data/seasonality.json`: Wochentag und Uhrzeit je Aktie, nur aus deren eigener Historie, ohne die Rohkurse.

## Lokal ansehen

Im Ordner der App:

```bash
python3 -m http.server 8080
```

Dann <http://127.0.0.1:8080/> öffnen. Für den echten Pfad wie auf GitHub Pages den Ordner als `Justy-gtr-app` unter einem anderen Wurzelverzeichnis ausliefern. Prüfungen:

```bash
npm test
npm run validate
npm run prices
```

`npm run prices` holt echte Kurse und schreibt nichts (`--dry-run`).

## Manuell auf GitHub

Das Repository ist öffentlich, die gehosteten Actions sind damit kostenlos. Zwei Dinge kann die Action nicht allein erledigen:

1. **GitHub Pages einschalten:** Einstellungen → Pages → Build and deployment → Source: **GitHub Actions**. Beim ersten Deploy legt die Action die Umgebung `github-pages` an. Falls GitHub nach einer Freigabe fragt, einmal bestätigen.
2. **Schreiben auf `main` erlauben**, falls der Branch geschützt ist: Der Account `github-actions[bot]` muss `data/prices.json`, `data/alerts.json`, `data/meta.json` und `data/seasonality.json` pushen dürfen. Sonst laufen die Kurse im Log, landen aber nicht in der App.

Es werden keine API-Schlüssel gebraucht und keine ins Repository gelegt.
