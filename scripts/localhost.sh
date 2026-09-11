#!/usr/bin/env bash
# Startet die Website dauerhaft auf localhost:8787 – PC (Firefox/Chrome) und Handy (LAN-IP).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export BIND_HOST="${BIND_HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export NODE_ENV="${NODE_ENV:-production}"

if [[ ! -f server/dist/index.js || ! -d web/dist ]]; then
  echo "[localhost] baue Website …"
  npm run build
fi

mkdir -p "$ROOT/data"
if ! pgrep -f 'scripts/keep-public.sh' >/dev/null 2>&1; then
  echo "[localhost] starte öffentlichen HTTPS-Tunnel (Keeper) …"
  nohup bash "$ROOT/scripts/keep-public.sh" >>"$ROOT/data/tunnel-keeper.log" 2>&1 &
  echo $! >"$ROOT/data/tunnel-keeper.pid"
fi

echo
echo "  Aegis Website (läuft weiter, auch ohne offenen Browser)"
echo "  PC:    http://localhost:${PORT}"
echo "  PC:    http://127.0.0.1:${PORT}"
echo "  Handy: gleiche WLAN-IP, Port ${PORT}  (nicht das Wort localhost)"
echo "  Internet: Adresse steht in data/public-url.txt und im Dashboard, sobald der Tunnel steht."
echo

exec bash "$ROOT/scripts/always-on.sh"
