# Datenvertrag für Justy GT-R

Die App ist statisch und liest nur die JSON-Dateien in `data/`. Ein Assistent darf sie per Commit auf `main` aktualisieren. Der Workflow `.github/workflows/prices.yml` überschreibt ausschließlich Marktfelder. Texte, die der Assistent pflegt, bleiben stehen.

`meta.dataMode` steuert das Schild in der App:

- `beispieldaten`: gelbes Schild „Beispiel“. So wird der Seed ausgeliefert.
- `live`: Schild aus. Erst setzen, wenn die Recherche-Texte echt sind und nicht mehr nur Platzhalter.

Der Kurs-Workflow ändert `dataMode` nicht.

## Gemeinsame Regeln

- UTF-8, JSON, zwei Leerzeichen, keine Kommentare.
- Jeder sachliche Eintrag hat `sources`: eine nicht leere Liste aus `{ "title": "…", "url": "https://…" }`.
- Platzhalter tragen `"example": true` und einen deutschen Text, der mit „Beispiel“ beginnt oder das klar sagt. Echte Einträge setzen `example` auf `false` oder lassen es weg.
- URLs nur `http` oder `https`. Die App wirft andere Schemas weg.
- Zeiten als ISO-8601 mit Offset, bevorzugt `Europe/Berlin` (`+01:00` / `+02:00`). Reine Tage als `YYYY-MM-DD`.
- Kurse in Euro, außer wo ein Feld ausdrücklich `Usd` heißt.
- Keine API-Schlüssel, Tokens oder privaten URLs in diese Dateien schreiben.

## Wer welches Feld besitzt

| Datei | Assistent | Kurs-Workflow |
| --- | --- | --- |
| `meta.json` | `dataMode`, `disclaimer`, `notes`, `owner`, `researchVoice` | `pricesUpdated`, `lastUpdated` (nur wenn Kurse sich ändern), `fx`, `priceStatus` |
| `prices.json` | `why`, `whySources`, `longTermOutlook`, `counterArgument`, `firstPrinciples`, `notes`, `narrativeExample` | alle Kurs-, Historien- und Quellenfelder der Börse, `asOf`, `fx`, `example: false` nach erfolgreichem Abruf |
| `alerts.json` | nur `notified` auf `true` setzen | Einträge anlegen und Kursfelder aktualisieren, `example`-Alerts nach einem erfolgreichen Lauf entfernen |
| alle anderen | vollständig | fasst sie nicht an |

`narrativeExample`: `true`, solange `why` und der Langfrist-Text noch aus dem Seed stammen. Der Workflow übernimmt den Text und lässt die Flagge auf `true`, bis der Assistent sie auf `false` setzt. Dann bleibt sie `false`.

`recordHighEur`: nach dem ersten echten Lauf das Maximum aus der echten Historie. Danach das Maximum aus dem bisherigen Stand und dem neuen Kurs. Ein Seed-Höchststand wird verworfen, sobald `example` am Ticker noch `true` war.

## `meta.json`

```json
{
  "dataMode": "beispieldaten",
  "lastUpdated": "2026-11-04T18:00:00+01:00",
  "pricesUpdated": null,
  "timezone": "Europe/Berlin",
  "owner": "Justy",
  "researchVoice": "Karl",
  "disclaimer": "Keine Anlageberatung. Nur Recherche und Bildung.",
  "fx": null,
  "priceStatus": {},
  "notes": ""
}
```

`priceStatus` je Symbol: `ok`, `stale`, `method` (`direct_eur` oder `usd_div_eurusd`), `venue`, `symbol`, `intradayMethod`, `error`.

## `prices.json`

```json
{
  "asOf": "2026-11-04T18:00:00+01:00",
  "example": true,
  "fx": {
    "pair": "EURUSD",
    "rate": 1.12,
    "meaning": "USD je 1 EUR. Umrechnung: Preis_EUR = Preis_USD / rate.",
    "asOf": "2026-11-04T18:00:00+01:00",
    "source": { "title": "Yahoo Finance EURUSD=X", "url": "https://finance.yahoo.com/quote/EURUSD=X" }
  },
  "tickers": []
}
```

Pflicht-Symbole: `SPCX`, `TSLA`, `RKLB`.

Ticker-Felder:

| Feld | Bedeutung |
| --- | --- |
| `symbol`, `name`, `role`, `venue` | `role` ist `Fokus`, `Tesla` oder `Vergleich` |
| `currency` | immer `EUR` für den angezeigten Kurs |
| `priceEur`, `priceUsd`, `previousCloseEur`, `changeEur`, `changePct` | `changePct` ist die Tagesveränderung in Euro |
| `dayHighEur`, `dayLowEur` | Tagespanne |
| `eurMethod` | `direct_eur` (deutscher Handelsplatz) oder `usd_div_eurusd` (Nasdaq geteilt durch EURUSD). Im Seed: `example` |
| `eurVenue`, `eurSymbol` | z. B. `Xetra` / `TL0.DE`, `Frankfurt` / `6RJ0.F`, sonst `null` |
| `usdSymbol`, `intradayMethod`, `fxRate` | Referenz und wie der Tagesverlauf entstand |
| `sparkline` | Liste der letzten Euro-Kurse, kurz |
| `history.intraday`, `history.1M`, `history.6M`, `history.1Y`, `history.5Y` | Listen aus `{ "t": "<ISO oder Tag>", "eur": 1.23 }`. `5Y` ist Wochenstufe für die Langfrist-Brille |
| `recordHighEur` | Höchststand in Euro |
| `why` | ein kurzer deutscher Satz, warum der Kurs sich bewegt |
| `whySources` | Quellen nur für diesen Satz |
| `longTermOutlook` | Text für die Langfrist-Brille |
| `counterArgument` | stärkstes Gegenargument |
| `firstPrinciples` | optional, Liste `{ "title", "text" }`. Die App bevorzugt `companies.json` |
| `stale`, `fetchError` | setzt der Workflow bei einem Fehlschlag |
| `example`, `narrativeExample` | siehe oben |
| `sources` | Börsenquellen. Der Workflow ersetzt sie |

Die App zeigt `why` über den Knopf „Warum?“. Fehlt der Text, steht dort, dass noch keine Einordnung hinterlegt ist.

## `alerts.json`

```json
{
  "example": false,
  "thresholdPct": 2,
  "notes": "",
  "alerts": [
    {
      "id": "TSLA-2026-11-04",
      "symbol": "TSLA",
      "name": "Tesla",
      "changePct": -2.4,
      "priceEur": 300.0,
      "thresholdPct": 2,
      "direction": "down",
      "timestamp": "2026-11-04T16:00:00+01:00",
      "notified": false,
      "example": false,
      "sources": [{ "title": "Yahoo Finance TL0.DE", "url": "https://finance.yahoo.com/quote/TL0.DE" }]
    }
  ]
}
```

`id` ist `SYMBOL-YYYY-MM-DD` im Berliner Datum. Dieselbe Id wird nicht neu angelegt. `notified` darf nur der Assistent auf `true` drehen, wenn er Justy informiert hat. Der Workflow lässt die Flagge und den ersten Zeitstempel in Ruhe und aktualisiert `changePct` und `priceEur`. Einträge älter als 14 Tage fallen weg. Bewegungen unter 2 Prozent erzeugen keinen Eintrag. Beispieldaten lösen den Ruhe-Modus nicht aus.

## `calendar.json`

```json
{
  "example": true,
  "events": [
    {
      "id": "evt-tesla-lieferungen",
      "title": "Tesla-Lieferzahlen",
      "date": "2026-11-12",
      "time": "15:30",
      "timezone": "Europe/Berlin",
      "kind": "company",
      "category": "lieferungen",
      "company": "Tesla",
      "tickers": ["TSLA"],
      "probabilityPct": 85,
      "impact": "hoch",
      "reasoning": "Warum der Termin den Kurs bewegen kann.",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`kind` ist `company` (Umschalter Unternehmen) oder `external` (Fed, Zölle, Wahlen, Regulierung, Gerichte, Zahlen Dritter). `probabilityPct` von 0 bis 100. `impact`: `hoch`, `mittel` oder `niedrig`. `time` darf `null` sein.

## `posts.json`

```json
{
  "example": true,
  "asOf": "2026-11-04T18:00:00+01:00",
  "sentiment": {
    "SPCX": { "score": 0.2, "label": "leicht zuversichtlich", "summary": "…", "sources": [] },
    "TSLA": { "score": -0.1, "label": "verhalten", "summary": "…", "sources": [] }
  },
  "posts": [
    {
      "id": "post-1",
      "account": "@elonmusk",
      "displayName": "Elon Musk",
      "postedAt": "2026-11-04T09:10:00+01:00",
      "summaryDe": "Deutsche Kurzfassung.",
      "originalText": "optional",
      "url": "https://x.com/…",
      "tickers": ["SPCX"],
      "companies": ["SpaceX"],
      "sentiment": "positiv",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`sentiment.score` von `-1` bis `1`. `posts[].sentiment`: `positiv`, `neutral` oder `negativ`. Konten, die vorgesehen sind: `@elonmusk`, `@SpaceX`, `@Tesla`, `@Starlink`, `@Tesla_Optimus`, `@neuralink`, `@xai` und weitere offizielle Konten. `summaryDe` ist die deutsche Fassung, `url` das Original.

## `favorites.json`

Karls fünf Favoriten. Die Startseite zeigt die Liste in `rank`-Reihenfolge.

```json
{
  "example": true,
  "asOf": "2026-11-04",
  "owner": "Karl",
  "favorites": [
    {
      "id": "fav-spcx",
      "rank": 1,
      "symbol": "SPCX",
      "name": "SpaceX",
      "score": 8,
      "reason": "Ein Satz.",
      "horizon": "langfrist",
      "counterArgument": "Das stärkste Gegenargument.",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`score` ist eine ganze Zahl von 1 bis 10. Fünf Einträge sind Karls Top 5 über den ganzen Markt, nicht nur SpaceX und Tesla. `counterArgument` erscheint über den Knopf „Gegenteil“. Optional: `karlStance`, `swarmStance` (`kauf`, `halten`, `verkauf`, `vorsichtig`, `kaum`), `againstCrowd`, `priceEur`, `priceVenue`, `priceAsOf`, `swarmNote`. Angezeigte Kurse sind Euro.

## `crowd.json`

```json
{
  "example": true,
  "asOf": "2026-11-04",
  "investors": [
    {
      "id": "inv-1",
      "name": "Name",
      "handle": "@name",
      "hitRatePct": 54,
      "hitRateHistory": [{ "date": "2026-10", "hitRatePct": 54 }],
      "tickers": [{ "symbol": "TSLA", "mentions": 12, "stance": "kauf" }],
      "note": "",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ],
  "comparison": {
    "swarmHitRatePct": 52,
    "karlHitRatePct": 62,
    "summary": "Ein Satz zum Vergleich Schwarm gegen Karl.",
    "sources": [{ "title": "…", "url": "https://…" }]
  }
}
```

`stance`: `kauf`, `halten`, `verkauf` oder `beobachten`. Die Trefferquoten im Vergleich nicht in der App neu rechnen lassen, wenn eine eigene Gewichtung gemeint ist. Die App zeigt die hinterlegten Zahlen.

## `promises.json`

```json
{
  "example": true,
  "promises": [
    {
      "id": "prm-1",
      "who": "Elon Musk",
      "company": "SpaceX",
      "promise": "Was gesagt wurde, in eigenen Worten, kein erfundenes Zitat als Zitat.",
      "promisedOn": "2024-04-01",
      "targetDate": "2026-12-31",
      "status": "offen",
      "delay": null,
      "note": "",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`status`: `offen`, `gehalten`, `verfehlt`, `verzoegert`, `teilweise`. `delay` ist ein deutscher Satz oder `null`.

## `production.json`

```json
{
  "example": true,
  "nextLaunch": {
    "name": "Starship-Testflug",
    "target": "2026-12-09T14:00:00+01:00",
    "livestreamUrl": "https://…",
    "status": "geplant",
    "note": "",
    "example": false,
    "sources": [{ "title": "…", "url": "https://…" }]
  },
  "series": [
    {
      "id": "starship_launches",
      "label": "Starship-Starts",
      "unit": "Starts",
      "company": "SpaceX",
      "example": false,
      "points": [{ "date": "2025", "value": 7 }],
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

Feste Serien-Ids, damit die Charts stabil bleiben: `starship_launches`, `starlink_users`, `tesla_deliveries`, `optimus_units`. Weitere Serien sind erlaubt. `nextLaunch.target` treibt den Countdown. Bei `livestreamUrl: null` gibt es keinen Link.

## `insiders.json`

```json
{
  "example": true,
  "trades": [
    {
      "id": "ins-1",
      "person": "Name",
      "role": "Director",
      "symbol": "TSLA",
      "company": "Tesla",
      "side": "kauf",
      "shares": 2000,
      "priceUsd": 240,
      "date": "2026-10-20",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`side`: `kauf` oder `verkauf`. Käufe bekommen in der App einen goldenen Rand.

## `briefing.json` und `weekly.json`

```json
{
  "example": true,
  "date": "2026-11-04",
  "title": "Morgen-Briefing",
  "greeting": "Guten Morgen, Justy.",
  "summary": "Ein Absatz.",
  "bullets": ["Punkt"],
  "audioUrl": null,
  "sources": [{ "title": "…", "url": "https://…" }]
}
```

`audioUrl` ist eine `https`-Adresse oder `null`. Nur wenn eine Adresse da ist, zeigt die App einen Player. Die Datei selbst wird nicht von der App erzeugt.

Wochenrückblick:

```json
{
  "example": true,
  "weekOf": "2026-11-02",
  "title": "Wochenrückblick",
  "summary": "…",
  "highlights": [{ "title": "SpaceX", "text": "…" }],
  "sources": [{ "title": "…", "url": "https://…" }]
}
```

## `daily_question.json`

```json
{
  "example": true,
  "current": {
    "id": "2026-11-04",
    "date": "2026-11-04",
    "question": "Schließt TSLA heute im Plus?",
    "karlAnswer": "nein",
    "karlReason": "Ein Satz.",
    "outcome": null,
    "resolvesAt": "2026-11-04T22:00:00+01:00",
    "sources": [{ "title": "…", "url": "https://…" }]
  },
  "history": []
}
```

`karlAnswer` und `outcome` sind `ja`, `nein` oder bei `outcome` noch `null`. Die App zeigt Karls Antwort erst, nachdem Justy auf diesem Gerät getippt hat. Antworten von Justy liegen in `localStorage` unter `jgtr-v1`, nicht in Git. Punkte gibt es nur für Fragen mit `outcome`, bei denen Justy geantwortet hat: ein Punkt je Seite, deren Antwort dem `outcome` entspricht. Abgeschlossene Fragen nach `history` schieben und `current` erneuern. `id` stabil lassen, sonst verliert das Gerät die Zuordnung.

## `glossary.json`

```json
{
  "example": true,
  "terms": [
    {
      "id": "kgv",
      "term": "KGV",
      "short": "Kurs-Gewinn-Verhältnis",
      "explanation": "Zwei oder drei eigene Sätze.",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

## `track_record.json`

```json
{
  "example": true,
  "asOf": "2026-11-04",
  "picks": [
    {
      "id": "tr-1",
      "symbol": "TSLA",
      "name": "Tesla",
      "pickedOn": "2026-06-01",
      "horizonEnd": "2026-09-01",
      "thesis": "…",
      "score": 7,
      "entryPriceEur": 230,
      "result": "offen",
      "outcomeNote": "",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`result`: `offen`, `treffer` oder `daneben`. Die Trefferquote rechnet die App selbst aus entschiedenen Einträgen. Eine mitgelieferte Summe wird ignoriert.

## `scenarios.json`

Für den Was-wäre-wenn-Rechner und den Ruhe-Modus. Keine Pflicht aus der ersten Dateiliste, aber die App liest sie.

```json
{
  "example": true,
  "scenarios": [
    {
      "id": "starship_fail",
      "title": "Starship-Start misslingt",
      "tickers": ["SPCX"],
      "summary": "Was die hinterlegten Fälle gemeinsam haben.",
      "medianMovePct": -2.2,
      "reactions": [
        {
          "date": "2025-03-06",
          "symbol": "SPCX",
          "movePct": -3.1,
          "note": "",
          "sources": [{ "title": "…", "url": "https://…" }]
        }
      ],
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ],
  "recoveries": [
    {
      "id": "rec-tsla",
      "symbol": "TSLA",
      "dropPct": -28,
      "period": "2022",
      "monthsToRecover": 18,
      "recoveryNote": "Wie lange der alte Stand brauchte. Keine Prognose.",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`medianMovePct` und `movePct` sind Prozent, negativ bei Verlust. Die App zeigt die hinterlegte Mitte, sie bildet sie nicht neu.

## `companies.json`

Erste Prinzipien und der Kosmos ohne Börsenkürzel. Die App bevorzugt diese Datei gegenüber `firstPrinciples` im Kursfile.

```json
{
  "example": true,
  "companies": [
    {
      "id": "spacex",
      "name": "SpaceX",
      "symbol": "SPCX",
      "listed": true,
      "role": "Fokus",
      "tagline": "Ein Satz.",
      "priceDrivers": ["Starlink-Anschlüsse"],
      "firstPrinciples": [{ "title": "Masse in den Orbit", "text": "…" }],
      "counterArgument": "…",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

Feste Ids: `spacex`, `tesla`, `rocketlab`, `neuralink`, `xai`, `terafab`, `boring`. Ohne Listing ist `symbol` `null` und `listed` `false`.

## Prüfung

`node scripts/validate-data.mjs` prüft Pflichtfelder, Quellen und dass keine Schlüssel-Muster in den Dateien stehen. Der Seiten-Workflow bricht ab, wenn das fehlschlägt.
