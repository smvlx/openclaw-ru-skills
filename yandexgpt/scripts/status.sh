#!/bin/bash
PID_FILE="/tmp/yandexgpt-proxy.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Running (PID $(cat "$PID_FILE"))"
  curl -s http://localhost:8444/v1/models 2>/dev/null | head -c 200
else
  echo "Not running"
fi
