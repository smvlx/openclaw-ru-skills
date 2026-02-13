#!/bin/bash
PID_FILE="$HOME/.openclaw/gigachat.pid"
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null && echo "Stopped" || echo "Not running"
  rm -f "$PID_FILE"
else
  echo "Not running"
fi
