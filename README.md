# Aegis – Paper-First Trading-Bot

Stabilitäts-orientierter Bot: **Paper mit 100 €**, Live nur nach Schlüssel + Bestätigung, 24/7, deutschsprachiges Dashboard.

## Was anders ist als bei den alten Bots

- Kein Trade ohne **Plan** (These, Invalidierung, SL, TP1, TP2).
- Qualität vor Frequenz. 10–20 Trades/Tag sind ein **Maximum**, kein Soll.
- Gebühren und ein Cash-Puffer werden vor jeder Größe mitgerechnet, damit nach einem Verlust noch gehandelt werden kann.
- Nach einer Serie kleiner Verluste (das alte Muster) stoppt der Bot neue Einstiege und zieht die Qualitätsschwelle nach oben. **Risiko wird nie automatisch erhöht.**
- Mix aus Mean Reversion (Kern), Trend, Grid und Breakout – die Marktphase entscheidet.
- Universum: liquide Krypto (Binance/Bybit) plus US-Aktien/ETFs in der Session. Keine illiquiden Memecoins.

Kein Bot kann Gewinne garantieren. Aegis ist so gebaut, dass er **aufhört**, wenn der Erwartungswert nach Gebühren negativ ist.

## Start

```bash
cp .env.example .env
# SMTP für E-Mail-Alerts eintragen
npm install
npm run dev
```

## Website öffnen (PC + Handy)

Der Bot und die Website laufen **unabhängig vom Browser**. Firefox und Chrome, PC und Handy.

```bash
npm run localhost
```

Das startet den Bot **und** einen HTTPS-Tunnel-Keeper (`npm run public`). Die aktuelle Internet-Adresse steht im Dashboard und in `data/public-url.txt`.

**Wichtig:** Cloudflare-Schnell-Links sind keine feste Domain. Nach einem Netz-Abbruch bekommst du automatisch einen **neuen** Link (der alte löst DNS nicht mehr auf). `localhost:8787` auf einem anderen Computer zeigt „Verbindung fehlgeschlagen“ – das ist normal.

Damit der Bot **wirklich dauerhaft** erreichbar bleibt: auf einem eigenen PC oder VPS `docker compose up -d` (plus `docker compose --profile public up -d` für HTTPS) – nicht nur in einer temporären Cloud-Agent-VM.

```bash
npm run public   # nur den HTTPS-Keeper, Bot muss schon laufen
```

```bash
# gleichwertig 24/7:
npm run start:always
docker compose up -d --build
```

```bash
npm run build
npm start
# oder 24/7:
npm run start:always
# oder:
docker compose up -d --build
```

## Live

1. `BINANCE_API_KEY` / `BINANCE_API_SECRET` in `.env`
2. Im Dashboard **Live** nur nach Bestätigung
3. Aktien-Live optional über Alpaca (Paper-URL ist Default)

Paper läuft unabhängig davon mit 100 € und echten Kursen.
