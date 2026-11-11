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
| `seasonality.json` | fasst sie nicht an | Wochentag und Uhrzeit je Aktie, einmal je Berliner Tag, ohne Rohkurse |
| `moonshots.json` | Texte, Termin, Quellen, `pastCatalysts`, Hebel-ISIN der drei festen Kandidaten | Kurse und Zählung der festen Kandidaten; `nearTerm` täglich aus dem Zahlungskalender |
| `sentiment.json` | Stimmung je Aktie, mehrmals am Tag | fasst sie nicht an |
| `de-turbos.json` | Beispiel-ISINs, Emittent, Quelle | fasst sie nicht an |
| `germany.json` | fasst Kurse und Morgen-Schwankung nicht an | Kurs, Tagesveränderung, Sparkline, Morgen-Schwankung |
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

`priceStatus` je Symbol: `ok`, `stale`, `method` (`direct_eur` oder `usd_div_eurusd`), `venue`, `symbol`, `intradayMethod`, `overnight` (`nachhandel`, `vorboerse`, `us` oder leer), `source` (`alpaca-iex` oder `yahoo`), `error`.

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

Pflicht-Symbole: `SPCX`, `TSLA`, `RKLB`, `MRVL`. Die Liste kommt aus `TICKERS` in `scripts/fetch-prices.mjs`.

Ticker-Felder:

| Feld | Bedeutung |
| --- | --- |
| `symbol`, `name`, `role`, `venue` | `role` ist `Fokus`, `Tesla`, `Vergleich` oder `Halbleiter` |
| `currency` | immer `EUR` für den angezeigten Kurs |
| `priceEur`, `priceUsd`, `previousCloseEur`, `changeEur`, `changePct` | `priceEur` ist der frischeste Druck von heute. Solange ein deutscher Platz heute gedruckt hat, ist das dessen letzter Kurs. Sonst die US-Vorbörse oder der US-Regulärhandel, in Euro. Der gestrige Schluss bleibt nur, wenn es heute noch keinen Druck gibt. `changePct` ist die Tagesveränderung in Euro gegen den Schluss davor |
| `dayHighEur`, `dayLowEur` | Hoch und Tief der Sitzung, die `priceEur` liefert (Xetra, Frankfurt, Stuttgart oder Nasdaq). Nicht der Nachthandel |
| `overnightPhase` | optional: `nachhandel` (US-Nachbörse), `vorboerse` (US-Vorbörse) oder `us` (Nasdaq-Regulärhandel, nachdem der Euro-Platz zu ist). Fehlt oder `null`, wenn keine zweite Notiz da ist |
| `overnightEur` | letzter Druck dieser Phase in Euro. Steht neben `priceEur`, wenn der große Kurs der deutsche Druck ist. Ist der große Kurs schon die US-Vorbörse, bleibt das Feld leer |
| `overnightHighEur`, `overnightLowEur` | Hoch und Tief derselben Phase. Bei `nachhandel` und `vorboerse` das Min/Max der geladenen Kerzen, weil die Quelle kein amtliches Overnight-Hoch/Tief liefert. Bei `us` das amtliche `regularMarketDayHigh` / `Low` der Nasdaq, umgerechnet |
| `overnightAsOf` | Zeit des letzten Drucks, ISO-8601 |
| `eurMethod` | `direct_eur` (deutscher Handelsplatz) oder `usd_div_eurusd` (Nasdaq geteilt durch EURUSD). Im Seed: `example` |
| `eurVenue`, `eurSymbol` | Platz des großen Kurses, z. B. `Xetra` / `SPX.DE`, `Frankfurt` / `SPX.F`, `Stuttgart` / `SPX.SG`, `Xetra` / `TL0.DE`, `Frankfurt` / `6RJ0.F`, `Stuttgart` / `6RJ0.SG`, `Xetra` / `9MW.DE`. `null`, wenn der große Kurs die umgerechnete Nasdaq ist |
| `usdSymbol`, `intradayMethod`, `fxRate` | Referenz und wie der Tagesverlauf entstand. `intradayMethod` zusätzlich `direct_eur_plus_us`, wenn nach dem Euro-Schluss Nasdaq-Punkte angehängt sind |
| `source` | `alpaca-iex`, wenn der US-Kurs oder die US-Minuten von Alpaca IEX kamen, sonst `yahoo`. Die Euro-Anzeige folgt weiter `eurMethod` |
| `sparkline` | Liste der letzten Euro-Kurse, kurz |
| `history.intraday`, `history.1H`, `history.4H`, `history.1M`, `history.6M`, `history.1Y`, `history.5Y` | Listen aus `{ "t": "<ISO oder Tag>", "eur": 1.23 }`. `intraday` ist die 1-Minuten-Reihe des laufenden Handelstags, höchstens etwa 30 Stunden und 1400 Punkte, nicht mehrere Tage. Frankfurt und Stuttgart ab etwa 08:00, Xetra ab 09:00, danach Nasdaq-Vorbörse und Regulärhandel, wenn die Punkte später liegen. Rocket Lab mischt `6RJ0.F` und `6RJ0.SG` (München füllt Lücken), bevor die Reihe als zu dünn gilt. Die App leitet „5 Min“ daraus ab, indem sie den letzten Druck jedes 5-Minuten-Blocks nimmt. `1H` sind 60-Minuten-Kerzen in Euro, etwa die letzten zehn Handelstage, mit Vorbörse und Nachbörse wenn die Quelle sie liefert (`session`: `pre`, `regular`, `post`). Fehlt `1H`, faltet die App die Minutenreihe zu Stunden. „1 Std“ zeigt davon so viele Kerzen, dass sie auf dem Telefon lesbar bleiben, grob fünf bis zehn Handelstage. „1W“ nimmt Stundenkerzen dieser Reihe, sonst 30-Minuten-Kerzen. „1M“ nimmt 4-Stunden-Kerzen des letzten Monats aus `4H`. `4H` sind 4-Stunden-Kerzen in Euro, serverseitig aus 60-Minuten-OHLC gebündelt, und länger als eine Sitzung. Fehlt `4H` oder umfasst es nur eine Sitzung, zeichnet die App keine 4-Stunden-Kerzen und „1M“ bleibt bei den Tageskursen. `open`, `high` und `low` stehen nur, wenn die Quelle sie hat. Intraday darf `session` und bei Dollar-Umrechnung `usd` tragen. `5Y` ist die Wochenreihe für 5J und die Langfrist-Brille |
| `recordHighEur` | Höchststand in Euro |
| `why` | ein kurzer deutscher Satz, warum der Kurs sich bewegt |
| `whySources` | Quellen nur für diesen Satz |
| `longTermOutlook` | Längerfristige Einordnung. Bleibt in den Daten, die Chart-Ansicht zeigt sie nicht als Schalter |
| `counterArgument` | stärkstes Gegenargument |
| `firstPrinciples` | optional, Liste `{ "title", "text" }`. Die App bevorzugt `companies.json` |
| `stale`, `fetchError` | setzt der Workflow bei einem Fehlschlag |
| `example`, `narrativeExample` | siehe oben |
| `sources` | Börsenquellen. Der Workflow ersetzt sie |

Die App zeigt `why` über den Knopf „Warum?“. Fehlt der Text, steht dort, dass noch keine Einordnung hinterlegt ist.

US-Minuten kommen zuerst von Alpaca IEX, inklusive Vorbörse und Nachbörse, wenn die Reihe lang genug ist und der letzte Druck auf dem heutigen US-Handelstag liegt. Liegt er auf einem früheren Handelstag, zählt die Reihe nicht als heute: dann Yahoo mit `includePrePost` und die deutsche 1-Minuten-Reihe. 5-Minuten- und Stundenkerzen kommen weiter zuerst von Alpaca IEX, wenn die Reihe lang genug ist. Sonst Yahoo. Tages- und Wochenreihen, der 4-Stunden-Block und die Euro-Plätze bleiben Yahoo. Der Wechselkurs bleibt EURUSD. Ohne `ALPACA_KEY_ID` und `ALPACA_SECRET_KEY` läuft alles über Yahoo.

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

`end` ist optional. Ein Tag `YYYY-MM-DD` gilt den ganzen Tag, eine ISO-Zeit ist der genaue Schluss. Fehlt `end`, zählt der Beginn (`date` und `time`). Die Kalenderseite sortiert beim Anzeigen, nicht in der Datei: Laufendes und Heutiges oben, der früheste Beginn zuerst, spätere Tage danach, Vorbei darunter. Liegt das Ende — oder der Beginn, wenn kein Ende da ist — mehr als 24 Stunden zurück, zeigt die Seite den Termin nicht. Die Rechnung nutzt die Uhr beim Öffnen.

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
      "vsSwarm": "skeptischer",
      "karlTake": "Kurzes Urteil: wo Karl kühler oder fester ist als der Schwarm.",
      "karlCounter": "Ein kurzer Einwand, nicht die Überschrift.",
      "reason": "Ein Satz.",
      "horizon": "langfrist",
      "counterArgument": "Das stärkste Gegenargument.",
      "example": false,
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

`score` ist eine ganze Zahl von 1 bis 10. Zehn Einträge sind Karls Top 10 über den ganzen Markt, nicht nur SpaceX und Tesla. `counterArgument` erscheint über den Knopf „Gegenteil“, wenn der Text länger oder anders ist als `karlCounter`. Optional: `karlStance`, `swarmStance` (`kauf`, `halten`, `verkauf`, `vorsichtig`, `kaum`), `againstCrowd`, `priceEur`, `priceVenue`, `priceAsOf`, `swarmNote`. Angezeigte Kurse sind Euro.

Pflicht auf jedem Favoriten, sobald der Vergleich mit dem Schwarm steht:

| Feld | Werte |
| --- | --- |
| `vsSwarm` | `zuversichtlicher` oder `skeptischer`. Kein dritter Wert. |
| `karlTake` | Ein oder zwei kurze Sätze. Das Urteil zuerst: wo Karl dem Schwarm mehr traut oder weniger, und warum. |
| `karlCounter` | Ein kurzer Satz dagegen. Er steht unter dem Urteil, nicht davor. |

`vsSwarm` ist Karls Temperatur **gegen den Schwarm**, nicht die Note allein. Wärme der Rohwerte: `vorsichtig` kälter als `kaum`, `kaum` kälter als `halten`, `halten` kälter als `kauf`. Ist Karl wärmer, steht `zuversichtlicher`. Ist er kälter oder gleich warm, steht `skeptischer`. Die App leitet dasselbe ab, wenn das Feld fehlt. Geschrieben wird es trotzdem.

Stimme: klare Sätze, wenig Wörter, Deutsch. Die erste Zeile ist das Urteil. Nicht einleiten mit „keine Prognose“, „unklar“, „vielleicht“, „eher“, „abwarten“. Die Wörter „kaufen“ und „verkaufen“ nie als Empfehlung, auch nicht verpackt. `karlStance` bleibt der Rohwert. Die Seite zeigt daraus nicht „neutral“ als Überschrift, sondern `vsSwarm` und die Zahl.

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
    "summary": "Erst wo Karl zuversichtlicher ist, dann wo er skeptischer ist.",
    "sources": [{ "title": "…", "url": "https://…" }]
  }
}
```

`stance`: `kauf`, `halten`, `verkauf` oder `beobachten`. Die Trefferquoten im Vergleich nicht in der App neu rechnen lassen und keine Quote erfinden, solange `swarmHitRatePct` oder `karlHitRatePct` null ist. Die App zeigt die hinterlegten Zahlen.

`comparison.summary` sind zwei kurze Sätze: erst wo Karl zuversichtlicher ist als der Schwarm, dann wo er skeptischer ist. Dieselbe Stimme wie `karlTake`. Kein Nachrichtenprotokoll, kein „abwarten“, keine erfundenen Treffer.

`comparison.picks` trägt dieselben Felder `vsSwarm`, `karlTake`, `karlCounter` wie die Favoriten. Die Seite nimmt die Favoriten, sobald welche da sind, und sonst die Picks. Die Sätze müssen übereinstimmen.

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
  "asOf": "2026-11-07",
  "lede": "Was die Firmen wirklich schaffen – nicht der Kurs.",
  "nextLaunch": {
    "name": "Starship-Testflug",
    "headline": "Starship Flight 15",
    "shortNote": "Erster Fang von Booster und Schiff",
    "statusNote": "Zulassung steht noch aus",
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
      "shortLabel": "",
      "unit": "Starts",
      "company": "SpaceX",
      "order": 3,
      "accent": "gold",
      "caption": "Flight 12–14 bisher",
      "example": false,
      "points": [{ "date": "2025", "value": 7 }],
      "plan": [
        {
          "date": "2026",
          "value": 25,
          "source": { "title": "FAA: bis zu 25 Starts pro Jahr", "url": "https://…" }
        }
      ],
      "benchmark": { "value": 128, "label": "Vorjahr gleiche Zeit", "note": "kumuliert bis Ende Q3" },
      "sources": [{ "title": "…", "url": "https://…" }]
    }
  ]
}
```

Feste Serien-Ids, damit die Charts stabil bleiben: `starship_launches`, `starlink_users`, `tesla_deliveries`, `optimus_units`. Weitere Serien sind erlaubt. `nextLaunch.target` treibt den Countdown (Tage, Stunden, Minuten, Europe/Berlin). Bei `livestreamUrl: null` gibt es keinen Link.

`lede` ist der eine Satz unter der Überschrift. Fehlt er, zeigt die App den festen Satz über Firmen statt Kurs.

`headline`, `shortNote` und `statusNote` sind optional und nur für die Karte. Fehlen sie, nimmt die App `name`, lässt die Kurzzeile weg und zeigt nur `status`. Die lange `note` bleibt hinter „Quellen“.

`order` sortiert die Kacheln. `company` gruppiert sie unter einer kleinen Überschrift. `shortLabel` ersetzt `label` in der Kachel, wenn gesetzt. `accent` färbt die Ist-Linie: `up`, `down`, `ice`, `gold`. Ohne `accent` entscheidet das Vorzeichen vom ersten zum letzten Punkt.

Die Zeile unter der Zahl rechnet die App. Ein `benchmark` (Vergleichszahl, die kein Punkt der Reihe ist) gewinnt. Sonst, wenn alle `date` Jahre sind: die Folge `2023–2026: 2 · 4 · 5 · 3`, plus `caption`. Sonst, wenn die letzten beiden Abstände Quartale sind (80–100 Tage): `zum Vorquartal`. Sonst der Punkt etwa ein Jahr vor dem letzten (`zum Vorjahr`). Sonst der vorherige Punkt. Große Zahlen (ab 1.000) ohne Einheit, ein laufendes Jahr als `3 in 2026`.

`plan` ist optional und rückwärtskompatibel. Jeder Eintrag ist `{ "date", "value", "source": { "title", "url" } }`. `date` ist ein Jahr (`2026`) oder ein Tag (`2026-09-30`) und soll zu einem Punkt der Reihe passen, damit die gestrichelte Linie auf derselben Zeitachse liegt. Nur ein offizieller Plan: Aussage des Unternehmens, von Musk, oder einer Behörde. Eine Analysten- oder Konsensschätzung ist kein Plan. Tesla nennt keine offizielle Quartals-Auslieferungszahl, deshalb hat `tesla_deliveries` kein `plan`. Starship 2026 trägt die 25 nur, weil `promises.json` die FAA-Genehmigung „bis zu 25 Starts pro Jahr ab Starbase“ mit der FAA-Seite belegt. Eine Reihe ohne `plan` bekommt keine Plan-Linie und keinen Satz darunter. Der Satz nennt den Plan zum letzten Ist-Punkt. Ein noch laufendes Jahr heißt `bisher`, ein abgeschlossenes Quartal `Ist`. Liegt der Plan weit außerhalb der Ist-Spanne, bleibt die Ist-Form lesbar und die Plan-Linie sitzt am Rand, mit der Zahl daneben. Quellen der Plan-Punkte liegen zusätzlich in `source`, die der Reihe weiter in `sources`.

`benchmark` ist ebenfalls optional: `{ "value", "label", "note" }`. Die 128 bei den SpaceX-Starts 2026 stehen so, weil sie im Hinweistext der Reihe stehen und kein Punkt der Kurve sind.

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

Wochenrückblick, geschrieben jeden Sonntag. `summary`, `highlights` und `sources` bleiben. Die Karten lesen die strukturierten Felder. Fehlen sie, zeigt die App nur den langen Text.

```json
{
  "example": true,
  "weekOf": "2026-11-02",
  "title": "Wochenrückblick KW 45",
  "lede": "Ein oder zwei Sätze. Datum, Freitag gegen Freitag, was die Woche trug.",
  "sessions": { "start": "2026-11-02", "end": "2026-11-06" },
  "symbols": [
    {
      "symbol": "SPCX",
      "startEur": 120.47,
      "endEur": 119.58,
      "changePct": -0.7,
      "closes": [{ "t": "2026-11-02", "eur": 122.23 }]
    }
  ],
  "events": [
    { "icon": "rocket", "text": "Ein kurzer Satz.", "meta": "Sa · SpaceX" }
  ],
  "upcoming": [
    { "date": "2026-11-09", "time": "11:51", "title": "ESCAPADE Gold", "probabilityPct": 85 }
  ],
  "summary": "Der lange Text, mehrere Absätze durch Zeilenumbrüche.",
  "highlights": [{ "title": "SpaceX", "text": "…" }],
  "sources": [{ "title": "…", "url": "https://…" }]
}
```

`lede` sind ein bis zwei Sätze über den Karten. `summary` und `highlights` liegen hinter „Mehr lesen“.

`sessions.start` und `sessions.end` sind der erste und der letzte New Yorker Handelstag der Woche, `YYYY-MM-DD`. Die App zeichnet daraus die Kurve.

`symbols` hält die drei Papiere in dieser Reihenfolge. `startEur` ist der Schluss des Freitags vor `weekOf`, `endEur` der Schluss des Freitags in der Woche, beides in Euro aus `prices.json` (`history.1M`, letzter Druck des New Yorker Tags). `closes` sind die fünf Tagesschlüsse Montag bis Freitag, `{ "t": "YYYY-MM-DD", "eur" }`. `changePct` ist die gerundete Bewegung und nur zur Kontrolle. Die App rechnet `(endEur − startEur) / startEur` selbst.

Die Fünf-Tage-Linie nimmt die Stundenkerzen `history.1H`, je New Yorker Handelstag. Fehlt `1H` an einem Tag oder hat der Tag dort weniger als zwei Punkte, gilt der Reihe nach `5m`, `4H`, `intraday`, `1M`, `6M`, `1Y`. Tage ohne Druck bleiben leer, es wird nichts aufgefüllt. Ohne `prices.json` zeichnet die App die `closes`. Senkrechte Striche trennen die Tage, darunter steht Mo–Fr.

`events` ist die kurze Chronik. `text` ist eine Zeile, `meta` die kleine zweite Zeile. `icon` ist `rocket`, `orbit`, `alert`, `car` oder `target`. Unbekannt wird ein Punkt.

`upcoming` ist der Blick auf die folgende Woche, so wie er am Sonntag stand. Nicht aus dem späteren Kalender überschreiben: Wahrscheinlichkeiten ändern sich, der Rückblick bleibt der Stand vom Sonntag. Jeder Eintrag hat `date`, `title`, optional `time` (`HH:MM` Berlin) und `probabilityPct`. Fehlt `upcoming`, nimmt die App Termine aus `calendar.json` von `weekOf` plus sieben Tage, sieben Tage lang, höchstens acht.

`sources` bleibt die eine Liste der Woche, hinter „Quellen“.

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

## `seasonality.json`

Eigene Historie je Aktie: wie oft Schluss zu Schluss an einem Wochentag stieg, und wie sich die Stunden in Berliner Zeit verhalten. Keine Rohkurse. Der Kurs-Workflow schreibt die Datei höchstens einmal je Berliner Tag neu (`scripts/fetch-seasonality.mjs`). Fehlt `symbols.*.dayPaths`, weicht `dayPaths.schema` von der Fassung im Code ab, oder fehlt `down` in den Zählungen, rechnet er trotzdem neu. Die Analyse-Spanne ändert diese Karte nicht.

`ranges.all` ist bis zu zwei Jahre, `ranges.year` die letzten 365 Tage bis zum letzten Tageskurs. `days` ist Mo–Fr mit `n`, `up`, `down`, `avg`, `med` (Prozent, Schluss zu Schluss). `hours` und `grid` sind die Berliner Slots `08`–`14` (volle Stunde), `15:00` (nur bis 15:30) und danach `15:30`–`21:30` der US-Sitzung. Jede Zelle in `hours` und `grid` hat `n`, `up`, `down` und `avg`. `up` zählt nur steigende Fälle, `down` nur fallende. Ein unveränderter Fall bleibt in `n` und in keiner der beiden Zahlen. Die Karte zeigt zwei Tabellen mit demselben Raster: „Long: Wie oft ging es hoch?“ (`up` / `n`) und darunter „Short: Wie oft ging es runter?“ (`down` / `n`). Prozent erst ab sieben Fällen, sonst ein Strich. Die Farbe folgt der gezeigten Prozentzahl, grün in der Long-Tabelle und rot in der Short-Tabelle. Fehlt `down` in einer älteren Datei, zeigt die Short-Tabelle einen Strich, bis der Lauf neu schreibt. Die Uhrzeit kommt vom echten Zeitstempel, damit die Sommerzeit nicht verrutscht. Vor 15:30 zählt der deutsche Yahoo-Kurs mit den meisten Stunden (Tesla `TL0.DE`/`TL0.F`/`TL0.SG`, Rocket Lab `6RJ0.F`/`6RJ0.SG`/`6RJ0.MU`, Marvell `9MW.DE`/`9MW.F`/`9MW.SG`, SpaceX Frankfurt `SPX.F`, ersatzweise Xetra `SPX.DE`). `SPX.F` ist bei Yahoo „Space Exploration Techs. Corp.“ an der Frankfurter Börse und hat Stunden ab 8 Uhr. Xetra öffnet erst um 9 und hat keine 8-Uhr-Stunde. Der angezeigte SpaceX-Kurs ist während der deutschen Stunden der frischeste deutsche Platz (`SPX.DE`, `SPX.F`, `SPX.SG`), nicht der gestrige Nasdaq-Schluss. Sonst, wo keine deutsche Reihe reicht, die US-Vorbörse, die etwa um 10:00 beginnt. Beides wird nicht in derselben Stunde gemischt. `earlyNote` sagt auf der Karte, welche Quelle die frühen Stunden trägt. Prozent zeigt die App erst ab sieben Fällen.

`dayPaths` (Schema `1`) ist der mittlere Verlauf von 07:00 bis 23:00 Uhr Berlin, 33 Körbe zu 30 Minuten. Die Basis ist der erste Druck ab 07:00. Ein Korb ohne Druck bleibt leer. Yahoo-60-Minuten reichen etwa zwei Jahre, 30 Minuten etwa 60 Tage, die US-Reihe inklusive Vorbörse und Nachbörse. Deutsche Kurse nur in Euro: Frankfurt, Xetra, Stuttgart, München, soweit Yahoo sie hat. Frankfurt gewinnt einen Korb, den beide handeln. Stuttgart und die anderen füllen Lücken, sobald dieselbe Börse einen vorherigen Druck hat. Der erste Druck einer neuen Börse ist nur die neue Basis und bleibt eine Lücke. Prozent je Börse, damit Euro und Dollar nicht springen. `coverage` nennt je Korb `n`, `where` und `sources`. 07:00 und 07:30 bleiben leer: Yahoo hat vor 08:00 keinen Druck, auch nicht über Tradegate oder Lang & Schwarz. Frankfurt füllt ab 08:00, Stuttgart die halben Stunden und den späten Handel bis etwa 21:30, die US-Nachbörse 22:00, 22:30 und 23:00. 22:30 liegt nur in den letzten etwa 60 Tagen, weil die lange US-Reihe stündlich auf 22:00 und 23:00 steht. Unter sieben Tagen zeichnet die App die Linie trotzdem und schreibt „wenige Tage“ dazu. Sind die Alpaca-Schlüssel gesetzt, hängt der Lauf IEX-Stunden (etwa zwei Jahre) und IEX-30-Minuten (etwa 70 Tage) als spätere Reihe an. Sie füllt nur leere Körbe, vor allem in den US-Stunden. `n`, `where` und `sources` bleiben. `usFeed` steht danach auf `alpaca-iex`, oder auf `yahoo`, wenn der IEX-Abruf leer blieb. Ohne Schlüssel fehlt `usFeed` und der Lauf ist der bisherige.

## `moonshots.json`

Drei feste Kandidaten mit einem datierten Termin, erreichbar unter Mehr, plus der Bereich `nearTerm` („Kurzfristig“). Die Sätze enthalten nicht „kaufen“, „verkaufen“, „Empfehlung“ oder „wird steigen“. Die Seite zeigt keine Zeile „Keine Anlageberatung“.

Der Assistent pflegt bei den festen dreien Name, `for`, `against`, `catalyst`, `pastCatalysts.dates`, `leverage` und `sources`. `scripts/fetch-moonshots.mjs` im Kurs-Workflow schreibt Kurs, Sparkline, `fx` und die Zählung. Die Zählung nimmt gut zwei Jahre Yahoo-Tagesschluss. Der Live-Kurs kann von Alpaca IEX kommen (`source`, `marketSource`). Die Zählung bleibt der Yahoo-Tagesschluss. `history.catalyst` ist der nächste Handelstag nach einem Termin nach US-Schluss, Schluss zu Schluss. `history.days` ist der Anteil der Tage mit einer Bewegung von mindestens 5 Prozent. Prozent erst ab `n` von 7. Die drei Fokus-Ticker SPCX, TSLA und RKLB kommen hier nicht vor.

`nearTerm` wählt einmal je Berliner Tag bis zu drei Namen aus `data/turbo-universe.json`. Das Universum ist der Nasdaq-100 zum 22. Oktober 2026 plus bekannte liquide Momentum-Werte, also Namen mit verbreiteten Knock-outs bei Trade Republic. Der Nasdaq-Kalender liefert die Zahlentermine. Zuerst zählen heute und die nächsten drei Handelstage. Liegen dort weniger als drei Termine, geht das Fenster bis fünf Handelstage, und `note` sagt das. Die Reihenfolge mischt die Nähe des Termins mit der Zahl großer Folgetage in den letzten acht Quartalen (mindestens +5 % oder höchstens −5 %). Eine Options-Spanne kommt dazu, wenn Yahoo sie ohne Schlüssel hergibt. Eine Beispiel-ISIN nur aus einer öffentlichen Emittentenliste, sonst gar keine. Vorbörsliche Termine zählen den Handelstag selbst, nachbörsliche den nächsten Handelstag. Prozent erst ab `n` von 7.

## `sentiment.json`

Wie auf X über SPCX, TSLA und RKLB geredet wird. MRVL steht in der Analyse, hat hier keinen Eintrag. Fehlt das Symbol, zeigt die Lampe „noch keine Daten“ und bleibt grau. Ein Assistent schreibt die Datei mehrmals am Tag. Kein Workflow. Die Wörter „kaufen“, „verkaufen“, „Empfehlung“, „Kaufsignal“ und „Anlageberatung“ sind verboten. Die Lampe beschreibt nur das Gerede, sie rät nicht.

Leerer Stand, so wie die Datei ausgeliefert wird: `example` ist `false`, `mood` ist leer, `score` ist `0`, `postsCount` ist `0`, `reason` und `updatedAt` der Zeile sind leer, `sources` ist leer. Die App zeigt dann „noch keine Daten“ und eine graue Lampe.

```json
{
  "example": false,
  "updatedAt": "2026-11-10T14:35:00+01:00",
  "schema": 1,
  "symbols": {
    "SPCX": {
      "mood": "gut",
      "score": 40,
      "postsCount": 12,
      "reason": "Viele Beiträge klingen freundlich.",
      "sources": [{ "title": "X-Suche", "url": "https://x.com/search?q=SPCX" }],
      "updatedAt": "2026-11-10T14:35:00+01:00"
    },
    "TSLA": {
      "mood": "",
      "score": 0,
      "postsCount": 0,
      "reason": "",
      "sources": [],
      "updatedAt": ""
    },
    "RKLB": {
      "mood": "gemischt",
      "score": -10,
      "postsCount": 4,
      "reason": "Lob und Zweifel stehen nebeneinander.",
      "sources": [{ "title": "X-Suche", "url": "https://x.com/search?q=RKLB" }],
      "updatedAt": "2026-11-10T14:35:00+01:00"
    }
  }
}
```

Pflicht-Symbole: `SPCX`, `TSLA`, `RKLB`. MRVL gehört nicht dazu. `schema` ist `1`.

| Feld | Bedeutung |
| --- | --- |
| `mood` | `gut`, `gemischt` oder `schlecht`. Leer, solange noch nichts da ist |
| `score` | ganze Zahl von −100 bis 100 |
| `postsCount` | Anzahl der Beiträge, ganze Zahl ab 0 |
| `reason` | ein kurzer deutscher Satz |
| `sources` | bei gesetztem `mood` mindestens eine Quelle `{ "title", "url" }`. Leer erlaubt, solange `mood` leer ist |
| `updatedAt` | ISO-8601 der Zeile. Leer, solange `mood` leer ist |
| `previousMood` | optional, einer der drei Töne. Gesetzt, wenn sich der Ton in diesem Stand geändert hat. Die Lampe pulsiert dann einmal, außer die Bewegung ist reduziert |

Die Lampe ist grün bei `gut` (`#22c55e`), rot bei `schlecht` (`#ef4444`), gelb bei `gemischt`. Grau, wenn der Ton fehlt oder `updatedAt` älter als zwei Stunden ist. Daneben steht „Stimmung · 14:35“ in Berliner Zeit, sonst „Stimmung · noch keine Daten“.

## `germany.json`

Xetra-Namen mit großem Auf und Ab am Morgen, die bei Trade Republic Long- und Short-Knock-outs haben. Die feste Liste steht in `data/de-turbos.json` (onvista, Filter Trade Republic, Stand `knockoutsAsOf`). `scripts/fetch-germany.mjs` im Kurs-Workflow schreibt die Kurse dazu. Yahoo liefert sie schon in Euro. Der Workflow fasst die Beispiel-ISINs nicht an.

```json
{
  "example": false,
  "asOf": "2026-11-10T08:00:00.000Z",
  "knockoutsAsOf": "2026-11-10",
  "timezone": "Europe/Berlin",
  "window": "09:00-10:30",
  "symbols": [
    {
      "symbol": "S92.DE",
      "name": "SMA Solar",
      "underlyingIsin": "DE000A0DJ6J9",
      "priceEur": 49.4,
      "changePct": 1.15,
      "sparkline": [48.2, 49.4],
      "intraday": [{ "t": "2026-11-10T08:00:00.000Z", "eur": 48.2 }],
      "morning": { "avgPct": 3.5, "maxPct": 7.6, "maxDay": "2026-11-03", "n": 21 },
      "trKnockouts": { "long": true, "short": true },
      "longExample": { "isin": "DE000HM4FG81", "issuer": "HSBC", "url": "https://…" },
      "shortExample": { "isin": "DE000FG9MP33", "issuer": "Société Générale", "url": "https://…" },
      "source": "https://www.onvista.de/…",
      "sources": [{ "title": "Yahoo Finance S92.DE", "url": "https://finance.yahoo.com/quote/S92.DE" }],
      "asOf": "2026-11-10T08:00:00.000Z"
    }
  ]
}
```

`morning` ist die Morgen-Schwankung: je Xetra-Tag `(Hoch − Tief) / Eröffnung` in Prozent, nur Kerzen von 09:00 bis vor 10:30 Uhr Berlin, aus den 15-Minuten-Kursen des letzten Monats. Der Mittelwert, der größte Tag und `n` nehmen die letzten höchstens 21 fertigen Sitzungen. Der noch laufende Morgen zählt nicht. `sparkline` und `intraday` sind der letzte Handelstag in 5 Minuten. Die Seite sortiert nach `avgPct`, der größte Morgen oben. Die Wörter „kaufen“, „verkaufen“, „Empfehlung“ und „Anlageberatung“ stehen hier nicht. Eine Beispiel-ISIN kann nach dem Knock-out weg sein.

## Prüfung

`node scripts/validate-data.mjs` prüft Pflichtfelder, Quellen und dass keine Schlüssel-Muster in den Dateien stehen. Der Seiten-Workflow bricht ab, wenn das fehlschlägt.
