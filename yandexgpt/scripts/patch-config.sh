#!/bin/bash
CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"
if [ ! -f "$CONFIG" ]; then
  echo "Config not found: $CONFIG"; exit 1
fi
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG','utf8'));
if (!cfg.providers) cfg.providers = {};
cfg.providers['yandexgpt'] = {
  type: 'openai',
  baseUrl: 'http://localhost:8444/v1',
  apiKey: 'not-needed',
  models: {
    'yandexgpt/yandexgpt': { id: 'yandexgpt', aliases: ['yagpt'] },
    'yandexgpt/yandexgpt-lite': { id: 'yandexgpt-lite', aliases: ['yagpt-lite'] },
    'yandexgpt/yandexgpt-32k': { id: 'yandexgpt-32k', aliases: ['yagpt-32k'] }
  }
};
fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2));
console.log('YandexGPT provider added');
"
