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

Zwei Eigenschaften sind dabei besonders wichtig:

**„Stoppen" hält nur neue Einstiege an.** Offene Positionen behalten ihren
Stop-Loss, ihren Trailing-Stop und den Notausstieg bei einbrechender
Liquidität. Andernfalls stünde bestehendes Kapital genau dann ungeschützt da,
wenn es am gefährlichsten ist – etwa während eines Rug-Pulls.

**Der Laufzustand übersteht Neustarts.** Lief der Handel vor einem Absturz oder
Neustart, nimmt der Bot ihn selbsttätig wieder auf (im Echtgeld-Modus erst nach
erneuter Prüfung aller Voraussetzungen). Ein Prozessneustart darf den Bot nicht
unbemerkt stilllegen.

---

## Wallet-Konzept

Weder Phantom noch MetaMask können einen Bot autonom handeln lassen – jede
Transaktion verlangt eine manuelle Bestätigung. Deshalb arbeitet Aletheia mit
zwei Wallets:

1. **Dein Phantom (Solana) oder MetaMask (EVM)** – wird verbunden und dient als
   Ein- und Auszahlungsziel. Der Bot bekommt dadurch keinerlei Zugriff darauf.
2. **Das Handelswallet des Bots** – wird lokal erzeugt, der private Schlüssel
   liegt mit scrypt + AES-256-GCM verschlüsselt in `data/bot.json`. Solana- und
   EVM-Schlüssel sind getrennt: ein altes Base-Wallet ist kein Solana-Wallet.

Die **Passphrase** ist kein Seed. Du vergibst sie selbst beim Erstellen; sie
verschlüsselt den privaten Schlüssel auf diesem Rechner. Nach einem Neustart
muss sie erneut eingegeben werden.

Du behältst jederzeit die volle Kontrolle: „Auszahlen" verlangt die Passphrase
und schickt das Guthaben an Phantom/MetaMask. Unter „Schlüssel & Notfall" kannst
du den Schlüssel exportieren, die Passphrase ändern oder das Bot-Wallet löschen
(Bestätigung `LÖSCHEN`), falls du die Passphrase vergessen hast.

Die API lauscht standardmäßig nur auf `127.0.0.1`. Nicht auf `0.0.0.0` setzen –
sonst kann jeder im Netz Auszahlung und Schlüsselexport versuchen.

### Echtgeld auf Solana (Standard)

Memecoin-Volumen und die meisten neuen Tokens liegen auf Solana. Live-Swaps
laufen über die **Jupiter Lite API** – ein API-Key ist nicht nötig.

Im Dashboard, rechte Seite „Echtgeld einrichten":

1. Bot-Wallet erstellen (Passphrase merken) – das ist eine **Solana-Adresse**
2. Wallet entsperren (nach jedem Server-Neustart erneut)
3. Auf **Solana** einzahlen: SOL oder USDC (gleiche Adresse), entweder kopieren
   oder direkt aus Phantom. Ein wenig SOL als Gebühr wird gebraucht, wenn du
   nur Tokens schickst. Native ETH oder Bitcoin kommen dort **nicht** an.
4. Oben auf **Echtgeld** umschalten und den Bot starten

Optional in `.env`: `WALLET_PASSPHRASE` (entsperrt beim Start automatisch)
und `RPC_URL` (eigener Solana-RPC; öffentliche Endpunkte limitieren stark).

EVM (Base/Ethereum/BSC/Arbitrum) bleibt über `CHAIN=base` verfügbar; Swaps
laufen dann über KyberSwap/LiFi.

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
├── chain/                 Hot-Wallet (Solana + EVM), Einzahlungen, Preise
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
| `BIND_HOST` | `127.0.0.1` | Adresse, auf der die API lauscht. Nicht auf `0.0.0.0` setzen, solange du das Dashboard nicht bewusst im Netz teilst. |
| `CHAIN` | `solana` | Chain für echte Swaps (`solana`, `base`, `ethereum`, `bsc`, `arbitrum`) |
| `RPC_URL` | öffentlich | Eigener RPC-Endpunkt |
| `WALLET_PASSPHRASE` | – | Entsperrt das Bot-Wallet beim Start |
| `ZEROX_API_KEY` | – | Optional, zusätzlicher Swap-Router |
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
