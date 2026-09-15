#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
# A broken listener (HTTP 500) still occupies 8080 and blocks npm run dev.
for d in /proc/[0-9]*; do
  comm=$(cat "$d/comm" 2>/dev/null || true)
  [ "$comm" = "node" ] || continue
  cmd=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *vite*) kill "$(basename "$d")" 2>/dev/null || true ;;
  esac
done
sleep 1
npm run dev >>/tmp/app-startup.log 2>&1 &
