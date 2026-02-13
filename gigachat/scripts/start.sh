#!/bin/bash
set -e

ENV_FILE="${GIGACHAT_ENV_FILE:-$HOME/.openclaw/gigachat.env}"
PID_FILE="/tmp/gpt2giga.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "gpt2giga already running (PID $(cat "$PID_FILE"))"
  exit 0
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: env file not found at $ENV_FILE"
  exit 1
fi

# gpt2giga reads env vars from --env-path
nohup gpt2giga \
  --env-path "$ENV_FILE" \
  --proxy.host 127.0.0.1 \
  --proxy.port 8443 \
  --proxy.pass-model true \
  --gigachat.verify-ssl-certs false \
  > /tmp/gpt2giga.log 2>&1 &

echo $! > "$PID_FILE"
echo "gpt2giga started on port 8443 (PID $!)"
sleep 2
