#!/bin/bash
set -e
ENV_FILE="$HOME/.openclaw/yandexgpt.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating env template at $ENV_FILE"
  cat > "$ENV_FILE" << 'EOF'
YANDEX_API_KEY=
YANDEX_FOLDER_ID=
YANDEX_PROXY_PORT=8444
EOF
  echo "Please fill in $ENV_FILE with your credentials"
else
  echo "Env file already exists at $ENV_FILE"
fi
