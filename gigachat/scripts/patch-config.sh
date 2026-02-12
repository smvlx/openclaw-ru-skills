#!/bin/bash
# Patch openclaw.json to add GigaChat provider
CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"

if [ ! -f "$CONFIG" ]; then
  echo "Config not found: $CONFIG"
  exit 1
fi

# Use node to patch JSON safely
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG','utf8'));
if (!cfg.providers) cfg.providers = {};
cfg.providers['gigachat'] = {
  type: 'openai',
  baseUrl: 'http://localhost:8443/v1',
  apiKey: 'not-needed',
  models: {
    'gigachat/GigaChat': { id: 'GigaChat', aliases: ['gigachat'] },
    'gigachat/GigaChat-Pro': { id: 'GigaChat-Pro', aliases: ['gigachat-pro'] },
    'gigachat/GigaChat-Max': { id: 'GigaChat-Max', aliases: ['gigachat-max'] }
  }
};
fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2));
console.log('GigaChat provider added to', '$CONFIG');
"
