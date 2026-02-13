#!/bin/bash
# GigaChat proxy startup script with auto-refresh token

set -e

ENV_FILE="${GIGACHAT_ENV_FILE:-$HOME/.openclaw/gigachat-new.env}"
PID_FILE="$HOME/.openclaw/gigachat.pid"
LOG_FILE="$HOME/.openclaw/gpt2giga.log"
PORT=8443

# Load credentials
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Environment file not found: $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

if [ -z "$GIGACHAT_CREDENTIALS" ]; then
  echo "Error: GIGACHAT_CREDENTIALS not set in $ENV_FILE"
  exit 1
fi

# Kill existing instance
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

fuser -k $PORT/tcp 2>/dev/null || true
sleep 2

# Generate access token
echo "Generating GigaChat access token..."
UUID=$(cat /proc/sys/kernel/random/uuid)
TOKEN_RESPONSE=$(curl -s -k -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Accept: application/json" \
  -H "RqUID: $UUID" \
  -H "Authorization: Basic $GIGACHAT_CREDENTIALS" \
  --data-urlencode "scope=${GIGACHAT_SCOPE:-GIGACHAT_API_PERS}" \
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "Error: Failed to get access token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "Token obtained successfully (expires in ~30min)"

# Start gpt2giga
echo "Starting gpt2giga proxy on port $PORT..."
gpt2giga \
  --proxy.port $PORT \
  --proxy.pass-model true \
  --gigachat.access-token "$ACCESS_TOKEN" \
  --gigachat.scope "${GIGACHAT_SCOPE:-GIGACHAT_API_PERS}" \
  --gigachat.verify-ssl-certs false \
  > "$LOG_FILE" 2>&1 &

NEW_PID=$!
echo $NEW_PID > "$PID_FILE"

sleep 2

# Verify it's running
if ! kill -0 $NEW_PID 2>/dev/null; then
  echo "Error: gpt2giga failed to start"
  cat "$LOG_FILE" | tail -20
  exit 1
fi

echo "✅ gpt2giga started successfully (PID: $NEW_PID)"
echo "   Log: $LOG_FILE"
echo "   Endpoint: http://localhost:$PORT/v1/chat/completions"
echo ""
echo "⚠️  Token expires in ~30 minutes. Restart this script to refresh."
