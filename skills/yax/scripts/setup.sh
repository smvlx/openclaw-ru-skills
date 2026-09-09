#!/bin/bash
set -e
ENV_FILE="$HOME/.openclaw/yax.env"
mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'EOF'
YAX_CLIENT_ID=
YAX_CLIENT_SECRET=
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — fill in your Yandex OAuth app credentials"
else
  echo "Env file exists at $ENV_FILE"
fi
