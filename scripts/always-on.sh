#!/usr/bin/env bash
# Hält den Bot-Prozess am Leben. Seite, Handy und PC des Nutzers sind egal –
# nur dieser Host muss laufen. Stirbt Node, startet die Schleife ihn neu.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f server/dist/index.js ]]; then
  echo "[always-on] baue Projekt …"
  npm run build
fi

export NODE_ENV="${NODE_ENV:-production}"

while true; do
  echo "[always-on] $(date -Is) start"
  node server/dist/index.js
  code=$?
  echo "[always-on] $(date -Is) Prozess beendet (Exit ${code}) – Neustart in 3s"
  sleep 3
done
