#!/usr/bin/env bash
# Hält einen öffentlichen HTTPS-Link am Leben.
# Cloudflare-Schnell-Tunnel sterben bei Netz-Timeout – dann muss der Prozess
# komplett neu starten (derselbe Hostname kommt nicht zurück).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p data
PORT="${PORT:-8787}"
URL_FILE="${ROOT}/data/public-url.txt"
LOG="${ROOT}/data/tunnel.log"

find_cf() {
  if [[ -n "${CLOUDFLARED:-}" && -x "${CLOUDFLARED}" ]]; then
    printf '%s' "$CLOUDFLARED"
    return
  fi
  if [[ -x /tmp/cloudflared ]]; then
    printf '%s' /tmp/cloudflared
    return
  fi
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return
  fi
  echo "[tunnel] lade cloudflared …"
  curl -fsSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x /tmp/cloudflared
  printf '%s' /tmp/cloudflared
}

write_url() {
  local url="$1"
  printf '%s\n' "$url" >"$URL_FILE"
  echo "[tunnel] $(date -Is) öffentlich: ${url}"
}

CF="$(find_cf)"
echo "[tunnel] cloudflared=${CF} → http://127.0.0.1:${PORT}"

while true; do
  echo "[tunnel] $(date -Is) starte neuen HTTPS-Tunnel"
  : >"$LOG"
  # stdbuf: URL-Zeile sofort sehen, nicht erst am Prozessende
  runner=( "$CF" )
  if command -v stdbuf >/dev/null 2>&1; then
    runner=( stdbuf -oL -eL "$CF" )
  fi
  "${runner[@]}" tunnel --no-autoupdate --url "http://127.0.0.1:${PORT}" 2>&1 \
    | tee -a "$LOG" \
    | while IFS= read -r line; do
        printf '%s\n' "$line"
        url="$(printf '%s\n' "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | head -1 || true)"
        if [[ -n "${url:-}" ]]; then
          prev="$(tr -d '[:space:]' <"$URL_FILE" 2>/dev/null || true)"
          if [[ "$prev" != "$url" ]]; then
            write_url "$url"
          fi
        fi
        if echo "$line" | grep -q 'Unauthorized: Tunnel not found'; then
          echo "[tunnel] alter Tunnel ungültig – Prozess wird neu gestartet"
          pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:${PORT}" 2>/dev/null || true
        fi
      done
  echo "[tunnel] $(date -Is) Verbindung weg – in 3s neuer Link"
  rm -f "$URL_FILE"
  sleep 3
done
