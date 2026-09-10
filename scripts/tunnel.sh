#!/usr/bin/env bash
# Öffentlicher HTTPS-Tunnel, damit Firefox/Chrome auf PC und Handy die Seite erreichen
# (localhost auf einem anderen Gerät zeigt sonst Verbindungsfehler).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p data
PORT="${PORT:-8787}"
CF="${CLOUDFLARED:-}"
if [[ -z "$CF" || ! -x "$CF" ]]; then
  if [[ -x /tmp/cloudflared ]]; then CF=/tmp/cloudflared
  elif command -v cloudflared >/dev/null 2>&1; then CF="$(command -v cloudflared)"
  else
    echo "[tunnel] lade cloudflared …"
    curl -fsSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x /tmp/cloudflared
    CF=/tmp/cloudflared
  fi
fi

echo "[tunnel] starte HTTPS für Port ${PORT} …"
exec "$CF" tunnel --no-autoupdate --url "http://127.0.0.1:${PORT}" 2>&1 | tee data/tunnel.log
