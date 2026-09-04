# Aletheia – Autonomer Krypto-/Memecoin-Trading-Bot

Ein vollautomatischer Trading-Bot mit Web-Dashboard. Er verdichtet Marktlage,
Fear-&-Greed-Index, Nachrichten-Sentiment, Social-Hype und On-Chain-Daten zu
einem Gesamtbild, sucht daraus fortlaufend Memecoin-Setups, prüft jeden Token
auf Rug-/Honeypot-Risiken und handelt vollautomatisch mit striktem
Risikomanagement.

**Standardmäßig läuft alles im Simulationsmodus mit echten Live-Kursen.** Echtes
Geld wird erst bewegt, wenn du den Echtgeld-Modus bewusst aktivierst.

---

## Schnellstart

```bash
git clone <repo> && cd <repo>
npm install
cp .env.example .env      # optional – Standardwerte funktionieren sofort
npm run dev
```

Dashboard öffnen: **http://localhost:5173**

Der API-Server läuft auf `http://localhost:8787`. Im Dev-Modus leitet das
Frontend `/api` und `/ws` automatisch dorthin weiter.

Für den Produktivbetrieb (ein einziger Prozess, Dashboard unter
`http://localhost:8787`):

```bash
npm run build && npm start
```

---

## Wie der Bot entscheidet

### 1. Gesamtmarktbild (alle 90 Sekunden)

Acht Signale werden nach Verlässlichkeit gewichtet zu einem **Risikoappetit**
zwischen 0 und 1 verdichtet:

| Signal | Quelle | Interpretation |
| --- | --- | --- |
| Fear & Greed Index | alternative.me | Bewusst nicht linear – das Optimum liegt bei „Gier, aber noch keine Euphorie". Bei extremer Angst fehlt die Liquidität, über 88 steigt das Risiko, in die Spitze zu kaufen. |
| Bitcoin-Trend | CoinGecko | 24h und 7d. Memecoins sind ein Hebel auf BTC – fällt BTC, sterben Meme-Rallyes zuerst. |
| Gesamtmarkt | CoinGecko | Veränderung der Marktkapitalisierung, BTC-Dominanz |
| Altcoin-Rotation | CoinGecko | Laufen ETH/SOL besser als BTC, fließt Kapital in die Risikokurve |
| Marktaktivität | CoinGecko | Verhältnis 24h-Volumen zu Marktkapitalisierung |
| News-Sentiment | CoinDesk, Cointelegraph, Decrypt, Bitcoin Magazine, Google News, optional CryptoPanic | Krypto-spezifisches Lexikon mit Negation und Verstärkern; frische Meldungen zählen mehr (Halbwertszeit 6 h) |
| Spekulations-Hitze | CoinGecko Trending, DexScreener Boosts | Suchen Anleger Small Caps? Kaufen Projekte aktiv Sichtbarkeit? |
| Memecoin-Aufmerksamkeit | Textanalyse der Schlagzeilen | Wie präsent ist der Meme-Sektor gerade |

### 2. Kandidatensuche (alle 25 Sekunden)

Über DexScreener werden Paare von Base, Solana, BNB Chain und Ethereum geladen –
aus der Suche sowie aus den aktuell geboosteten Token. Pro Token bleibt nur das
liquideste Paar übrig. Ein Vorfilter entfernt Stablecoins, Wrapped-Token, zu
junge Paare und alles ohne nennenswertes Volumen.

### 3. Sicherheitsprüfung

Die aussichtsreichsten Kandidaten laufen durch die GoPlus-Security-API
(EVM **und** Solana). Geprüft werden unter anderem Honeypot-Verhalten,
Kauf-/Verkaufssteuern, nachträglich änderbare Steuern, pausierbare Transfers,
Blacklist- und Owner-Rechte, Mint-Autorität, LP-Sperre und die Verteilung der
größten Wallets.

Ein Honeypot führt zur sofortigen Ablehnung **und** landet dauerhaft auf der
Sperrliste. Das ist der wichtigste Filter des Systems: Ein Token, aus dem man
nicht wieder herauskommt, ruiniert jede Trefferquote.

### 4. Bewertung (0–100)

| Faktor | Gewicht | Was gemessen wird |
| --- | --- | --- |
| Preis-Momentum | 22 % | 5m/1h/6h gewichtet; parabolische Anstiege werden abgewertet, Dead-Cat-Bounces erkannt |
| Contract-Sicherheit | 16 % | Ergebnis der GoPlus-Prüfung |
| Volumen & Beschleunigung | 16 % | Umschlagshäufigkeit plus Vergleich der 5-Minuten-Rate mit dem 1h-Schnitt |
| Kaufdruck | 15 % | Verhältnis Käufe zu Verkäufen, nach Stichprobengröße gewichtet |
| Liquidität | 11 % | Poolgröße (Sättigungskurve) |
| Paar-Alter | 9 % | Sweet Spot rund um einen Tag: alt genug gegen Instant-Rugs, jung genug für Bewegung |
| Marktkapitalisierung | 6 % | Logarithmische Glocke um ca. 3 Mio. USD |
| Sichtbarkeit / Hype | 5 % | Bezahlte DexScreener-Boosts |

Der Rohscore beschreibt die Qualität des Setups. Erst danach wirkt das
Marktumfeld als Multiplikator (0,70 – 1,05): dasselbe Setup ist in einem
Risk-off-Markt objektiv weniger wert.

**Harte Ausschlusskriterien** (unabhängig vom Score): Honeypot, Verkaufssteuer
über 12 %, zu geringe Liquidität, unter 5.000 USD Stundenvolumen, weniger als 25
Transaktionen pro Stunde, Paar jünger als 15 Minuten, über 120 % Anstieg in fünf
Minuten, über 55 % Verlust auf 24h, Marktkapitalisierung mehr als das 80-fache
der Liquidität, aktiver Cooldown oder Sperrliste.

### 5. Ein- und Ausstieg (alle 6 Sekunden)

Einstieg nur, wenn Score ≥ Schwelle (Standard 55), alle Risikoprüfungen bestehen
und ein Platz frei ist. Maximal eine neue Position pro Durchlauf.

Die Positionsgröße folgt einem Fixed-Fractional-Ansatz, moduliert durch
Signalstärke (0,6× – 1,25×) und Marktumfeld, gedeckelt auf 0,2 % der
Poolliquidität, damit die eigene Order den Kurs nicht bewegt.

Ausstiege, in dieser Reihenfolge geprüft:

1. **Notausstieg** bei eingebrochener Liquidität
2. **Stop-Loss** (Standard −18 %)
3. **Erste Gewinnmitnahme** bei +35 % → Hälfte verkaufen
4. **Zweite Gewinnmitnahme** bei +77 % → Hälfte des Rests
5. **Trailing-Stop** −14 % vom Höchststand, sobald ein Puffer besteht
6. **Momentum-Umkehr**: im Plus, aber 5-Minuten-Kurs bricht ein
7. **Zeitstopp** nach 45 Minuten ohne Fortschritt

### 6. Risikomanagement

- Tagesverlustlimit (Standard 25 %) → Bot pausiert bis zum nächsten Tag
- Maximaler Drawdown (Standard 40 %) → Notaus, alle Positionen werden verkauft
- 20 Minuten Pause nach drei Verlusten in Folge
- 30 Minuten Cooldown pro Token nach jedem Ausstieg
- Slippage-Limit bricht den Kauf ab, wenn die Ausführung zu teuer wird
- Sicherheitsprüfung wird unmittelbar vor dem Kauf wiederholt

---

## Wallet-Konzept

MetaMask kann einen Bot nicht autonom handeln lassen – jede Transaktion
verlangt eine manuelle Bestätigung im Browser. Deshalb arbeitet Aletheia mit
zwei Wallets:

1. **Dein MetaMask** – wird verbunden und dient ausschließlich als
   Auszahlungsziel. Der Bot bekommt dadurch keinerlei Zugriff darauf.
2. **Das Handelswallet des Bots** – wird lokal erzeugt, der private Schlüssel
   liegt mit scrypt + AES-256-GCM verschlüsselt in `data/bot.json`. Du zahlst
   dort z. B. 10 € in ETH auf Base ein, und der Bot handelt eigenständig damit.

Du behältst jederzeit die volle Kontrolle: „Auszahlen" schickt das gesamte
Guthaben an deine MetaMask-Adresse zurück, und über `POST /api/wallet/export`
lässt sich der private Schlüssel exportieren und direkt in MetaMask importieren.

### Echtgeld-Modus aktivieren

1. `.env` anlegen und `WALLET_PASSPHRASE` setzen
2. Einen `ZEROX_API_KEY` von [dashboard.0x.org](https://dashboard.0x.org)
   eintragen – darüber läuft das Swap-Routing
3. Eigenen `RPC_URL` eintragen (empfohlen; öffentliche RPCs limitieren stark)
4. Im Dashboard MetaMask verbinden, Bot-Wallet erstellen, ETH auf **Base**
   einzahlen
5. Auf „Echtgeld" umschalten und starten

Base ist voreingestellt, weil die Transaktionsgebühren dort im Bereich weniger
Cent liegen – bei einem Einsatz von 10 € ist das entscheidend.

---

## Architektur

```
server/src
├── config.ts              Konfiguration, unterstützte Chains
├── intel/                 Marktlage
│   ├── fearGreed.ts       Fear-&-Greed-Index
│   ├── macro.ts           Marktkapitalisierung, BTC/ETH/SOL
│   ├── news.ts            RSS-Feeds + CryptoPanic
│   ├── sentiment.ts       Krypto-Lexikon mit Negation/Verstärkern
│   ├── social.ts          Trending-Coins, bezahlte Boosts
│   └── index.ts           Verdichtung zum Risikoappetit
├── scanner/               Kandidatensuche
│   ├── dexscreener.ts     Paare finden, Preis-Snapshots
│   ├── security.ts        GoPlus-Prüfung (EVM + Solana)
│   ├── scoring.ts         Bewertungsmodell
│   └── index.ts           Scan-Durchlauf
├── trading/
│   ├── engine.ts          Hauptschleife, Ein-/Ausstiegslogik
│   ├── portfolio.ts       Positionen, Trades, Kennzahlen
│   ├── risk.ts            Risikoprüfungen, Positionsgröße
│   └── executor/          Simulation und echte Swaps
├── chain/                 Wallet (viem), Native-Preise
├── api/                   REST-Endpunkte, WebSocket, Zustand
└── store/db.ts            Persistenz (JSON, atomar)

web/src                    React-Dashboard mit Live-WebSocket
```

Der Zustand liegt in `data/bot.json` (nicht im Repository). Zum vollständigen
Zurücksetzen genügt das Löschen der Datei.

---

## Wichtige Umgebungsvariablen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `TRADING_MODE` | `paper` | `paper` oder `live` |
| `PAPER_START_BALANCE` | `11` | Startkapital der Simulation in USD |
| `CHAIN` | `base` | Chain für echte Swaps (`base`, `ethereum`, `bsc`, `arbitrum`) |
| `RPC_URL` | öffentlich | Eigener RPC-Endpunkt |
| `WALLET_PASSPHRASE` | – | Entsperrt das Bot-Wallet beim Start |
| `ZEROX_API_KEY` | – | Pflicht für echte Swaps |
| `CRYPTOPANIC_API_KEY` | – | Optional, ergänzt die News-Quellen |
| `MIN_ENTRY_SCORE` | `55` | Einstiegsschwelle |

Alle Strategie-Parameter lassen sich auch im Dashboard live ändern.

---

## API

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/state` | Kompletter Zustand |
| `GET` | `/api/intel` · `/api/candidates` · `/api/logs` | Einzelbereiche |
| `POST` | `/api/bot/start` · `/stop` · `/panic` | Steuerung |
| `POST` | `/api/bot/mode` | Modus wechseln |
| `PATCH` | `/api/settings` | Strategie anpassen |
| `POST` | `/api/positions/:id/close` · `/close-all` | Positionen schließen |
| `POST` | `/api/wallet/owner` · `/create` · `/unlock` · `/lock` · `/withdraw` · `/export` | Wallet |
| `POST` | `/api/paper/reset` | Simulation zurücksetzen |
| `WS` | `/ws` | Live-Stream aller Ereignisse |

---

## Risikohinweis

Memecoin-Handel ist hochspekulativ. **Kein Algorithmus kann Gewinne oder eine
bestimmte Trefferquote garantieren – auch dieser nicht.** Der Bot arbeitet mit
Wahrscheinlichkeiten; Totalverluste einzelner Positionen sind ein normaler Teil
der Strategie. Was dieses System leistet, ist konsequente Disziplin: Es prüft
jeden Token auf Betrugsmerkmale, begrenzt jeden Verlust, nimmt Gewinne
gestaffelt mit und hält sich ausnahmslos an die gesetzten Limits.

Setze ausschließlich Geld ein, dessen Verlust du verkraften kannst, und lass den
Bot zuerst ausgiebig im Simulationsmodus laufen. Diese Software ist keine
Anlageberatung.
