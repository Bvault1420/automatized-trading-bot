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

echo
echo "  Aegis Website (läuft weiter, auch ohne offenen Browser)"
echo "  PC:    http://localhost:${PORT}"
echo "  PC:    http://127.0.0.1:${PORT}"
echo "  Handy: gleiche WLAN-IP, Port ${PORT}  (nicht das Wort localhost)"
echo

exec bash "$ROOT/scripts/always-on.sh"
