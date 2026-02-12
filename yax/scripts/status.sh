#!/bin/bash
TOKEN_FILE="$HOME/.openclaw/yax-token.json"
if [ -f "$TOKEN_FILE" ]; then
  echo "Authenticated (token file exists)"
  node -e "const t=require('$TOKEN_FILE'); console.log('Token type:', t.token_type || 'bearer')"
else
  echo "Not authenticated. Run: node src/yax.js auth"
fi
