#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/yandexgpt-proxy.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "YandexGPT proxy already running (PID $(cat "$PID_FILE"))"
  exit 0
fi

nohup node "$SCRIPT_DIR/../src/proxy.js" > /tmp/yandexgpt-proxy.log 2>&1 &
echo $! > "$PID_FILE"
echo "YandexGPT proxy started (PID $!)"
sleep 1
