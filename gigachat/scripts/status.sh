#!/bin/bash
PID_FILE="/tmp/gpt2giga.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Running (PID $(cat "$PID_FILE"))"
  curl -s http://localhost:8443/v1/models | head -c 200
else
  echo "Not running"
fi
