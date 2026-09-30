#!/bin/bash
# Anweisungen Finder bridge: stage .beak and open Dock Safari Web App with ?pending=1
set -euo pipefail
SERVE_DIR="${ANWEISUNGEN_SERVE:-/Users/dk/Anweisungen-serve}"
URL="http://127.0.0.1:8765/?pending=1"
HOME_URL="http://127.0.0.1:8765/"
WEBAPP="${ANWEISUNGEN_WEBAPP:-$HOME/Applications/Anweisungen.app}"
LOG="/tmp/anweisungen-opener.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

ensure_serve() {
  if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:8765/" 2>/dev/null; then
    return 0
  fi
  log "serve down — starting"
  if [[ -f "$HOME/Library/LaunchAgents/com.anweisungen.http.plist" ]]; then
    launchctl kickstart -k "gui/$(id -u)/com.anweisungen.http" 2>>"$LOG" || true
    for i in 1 2 3 4 5 6 7 8 9 10; do
      sleep 0.4
      if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:8765/" 2>/dev/null; then
        return 0
      fi
    done
  fi
  if [[ -x "$SERVE_DIR/serve.rb" || -f "$SERVE_DIR/serve.rb" ]]; then
    /usr/bin/ruby "$SERVE_DIR/serve.rb" >> /tmp/anweisungen-http.log 2>&1 &
    for i in 1 2 3 4 5 6 7 8 9 10; do
      sleep 0.4
      if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:8765/" 2>/dev/null; then
        return 0
      fi
    done
  fi
  log "serve failed to start"
  osascript -e 'display notification "Anweisungen-Serve startet nicht (Port 8765)." with title "Anweisungen"' || true
  return 1
}

stage_one() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    log "missing file: $f"
    return 1
  fi
  /usr/bin/ruby "$SERVE_DIR/serve.rb" --stage "$f" >>"$LOG" 2>&1 || {
    mkdir -p /tmp/anweisungen-inbox
    cp -f "$f" /tmp/anweisungen-inbox/pending.beak
    /usr/bin/python3 - <<PY
import json, os, time
meta={"name": os.path.basename("""$f"""), "stagedAt": int(time.time()), "src": """$f"""}
open("/tmp/anweisungen-inbox/pending.json","w").write(json.dumps(meta))
print(json.dumps(meta))
PY
  }
  log "staged $f"
}

webapp_is_localhost() {
  local start=""
  [[ -f "$WEBAPP/Contents/Info.plist" ]] || return 1
  start="$(/usr/bin/plutil -extract Manifest.start_url raw "$WEBAPP/Contents/Info.plist" 2>/dev/null || true)"
  case "$start" in
    http://127.0.0.1:8765*|http://localhost:8765*) return 0 ;;
    *) return 1 ;;
  esac
}

open_in_dock_webapp() {
  local target="$1"
  # Prefer path (UUID changes when Web App is re-added). Same Dock window as launching Anweisungen.
  if [[ -d "$WEBAPP" ]]; then
    open -a "$WEBAPP" "$target" 2>>"$LOG" && return 0
    # Fallback: bundle id from current Info.plist
    local bid
    bid="$(/usr/bin/plutil -extract CFBundleIdentifier raw "$WEBAPP/Contents/Info.plist" 2>/dev/null || true)"
    if [[ -n "$bid" ]]; then
      open -b "$bid" "$target" 2>>"$LOG" && return 0
    fi
  fi
  return 1
}

open_app() {
  if webapp_is_localhost; then
    if open_in_dock_webapp "$URL"; then
      log "opened Dock Web App $URL"
      return 0
    fi
  else
    log "Web App start_url not localhost — pending needs same origin"
    osascript -e 'display notification "Einmalig: In Safari http://127.0.0.1:8765 öffnen → Ablage → Zum Dock hinzufügen (altes Anweisungen ersetzen)." with title "Anweisungen Dock-App"' || true
  fi
  # Fallback: default browser (pending still works on localhost)
  open "$URL" 2>>"$LOG" || open -a "Safari" "$URL" 2>>"$LOG" || true
  log "opened default browser $URL"
}

if [[ $# -lt 1 ]]; then
  ensure_serve || true
  if webapp_is_localhost && open_in_dock_webapp "$HOME_URL"; then
    exit 0
  fi
  open "$HOME_URL" || true
  exit 0
fi

ensure_serve || exit 1
for arg in "$@"; do
  path="$arg"
  if [[ "$path" == file://* ]]; then
    path="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.unquote(sys.argv[1][7:]))' "$path")"
  fi
  stage_one "$path" || true
done
open_app
exit 0
