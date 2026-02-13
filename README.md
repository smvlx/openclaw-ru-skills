# OpenClaw Russian AI Skills

OpenClaw skills for **GigaChat** (Sber), **YandexGPT**, and **Yandex 360** (Disk/Calendar).

## What This Enables

Your OpenClaw agent can:

- 🤖 **GigaChat** - Use Sber AI models (Lite, Pro, Max) or create Russian-speaking subagents
- 🦊 **YandexGPT** - Use Yandex Foundation Models (lite, default, 32k) or create subagents
- 📁 **Yandex Disk** - Upload/download files, manage folders
- 📅 **Yandex Calendar** - Create/list calendar events with timezone support

## Installation

```bash
cd /openclaw/skills
git clone https://github.com/smvlx/openclaw-ru-skills.git
```

OpenClaw will auto-discover skills in `/openclaw/skills/`.

## Configuration

### 1. GigaChat (Sber AI)

**Get credentials:**
1. Register at https://developers.sber.ru/
2. Create GigaChat API application
3. Note Client ID and Client Secret

**Setup:**
```bash
# Create env file
cat > ~/.openclaw/gigachat-new.env << EOF
CLIENT_ID="your-client-id"
CLIENT_SECRET="your-client-secret"
GIGACHAT_CREDENTIALS=$(echo -n "$CLIENT_ID:$CLIENT_SECRET" | base64)
GIGACHAT_SCOPE="GIGACHAT_API_PERS"
EOF

# Install proxy
pip3 install gpt2giga

# Start proxy (runs on localhost:8443)
/openclaw/skills/gigachat/scripts/start-proxy.sh
```

**Add to `openclaw.json`:**
```json
{
  "models": {
    "providers": {
      "gigachat": {
        "baseUrl": "http://127.0.0.1:8443",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          { "id": "GigaChat-Max", "name": "GigaChat MAX" },
          { "id": "GigaChat-Pro", "name": "GigaChat Pro" },
          { "id": "GigaChat", "name": "GigaChat Lite" }
        ]
      }
    }
  }
}
```

**Optional - Create Russian subagent:**
```json
{
  "agents": {
    "list": [
      {
        "id": "ruslan",
        "name": "Ruslan",
        "emoji": "🐻",
        "model": "gigachat/GigaChat-Pro",
        "workspace": "~/.openclaw/agents/ruslan/workspace"
      }
    ]
  }
}
```

---

### 2. YandexGPT (Foundation Models)

**Get credentials:**
1. Create service account at https://console.cloud.yandex.ru/iam
2. Grant `ai.languageModels.user` role
3. Create API key

**Setup:**
```bash
# Create env file
cat > ~/.openclaw/yandexgpt.env << EOF
YANDEX_API_KEY="your-api-key"
YANDEX_FOLDER_ID="your-folder-id"
YANDEX_PROXY_PORT="8444"
EOF

# Start proxy (runs on localhost:8444)
/openclaw/skills/yandexgpt/scripts/start.sh
```

**Add to `openclaw.json`:**
```json
{
  "models": {
    "providers": {
      "yandexgpt": {
        "baseUrl": "http://127.0.0.1:8444",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          { "id": "yandexgpt", "name": "YandexGPT" },
          { "id": "yandexgpt-lite", "name": "YandexGPT Lite" },
          { "id": "yandexgpt-32k", "name": "YandexGPT 32K" }
        ]
      }
    }
  }
}
```

---

### 3. Yandex 360 (Disk & Calendar)

**Get credentials:**
1. Create OAuth app at https://oauth.yandex.ru/client/new
2. Scopes: `cloud_api:disk.app_folder`, `cloud_api:disk.info`, `calendar:all`
3. Note Client ID

**Setup:**
```bash
# Create env file
cat > ~/.openclaw/yax.env << EOF
YAX_CLIENT_ID="your-client-id"
YAX_CLIENT_SECRET="your-client-secret-if-any"
EOF

# Authenticate (device code flow - agent can do this)
cd /openclaw/skills/yax
node src/yax.cjs auth device
# Agent will get URL and code to show user
```

**Agent capabilities:**
```javascript
// Upload files
exec("node /openclaw/skills/yax/src/yax.cjs disk upload local.txt /remote.txt")

// Download files
exec("node /openclaw/skills/yax/src/yax.cjs disk download /remote.txt local.txt")

// Create calendar events
exec("node /openclaw/skills/yax/src/yax.cjs calendar create 'Meeting' '2026-02-14' '14:00:00' '15:00:00' 'Description' 'Europe/Moscow'")

// List calendars
exec("node /openclaw/skills/yax/src/yax.cjs calendar list")
```

## Agent Usage Examples

**Ask agent to use GigaChat:**
> "Switch to GigaChat-Max and answer in Russian: Как дела?"

**Ask agent to manage Yandex Disk:**
> "Upload the article draft to Yandex Disk"

**Ask agent to create calendar event:**
> "Create a calendar event for tomorrow at 2pm: Team Meeting"

**Create Russian-speaking subagent:**
> "Spawn a subagent using GigaChat-Pro to proofread this text in Russian"

## Architecture

```
OpenClaw Agent
  ├─→ GigaChat Proxy (localhost:8443) ─→ Sber API
  ├─→ YandexGPT Proxy (localhost:8444) ─→ Yandex API
  └─→ yax CLI ─→ Yandex 360 APIs
```

All proxies run locally and translate OpenAI-format requests to native APIs.

## Security

- ✅ Tokens stored with 0600 permissions
- ✅ Proxies bind to 127.0.0.1 only
- ✅ Token expiry checking
- ✅ Cross-platform (Linux & macOS)

## Troubleshooting

**GigaChat 401:** Token expired (30min) → Restart `start-proxy.sh`  
**GigaChat 402:** Quota exhausted → Try different model  
**YandexGPT 403:** Wrong folder ID → Check env file  
**Yandex 360 token expired:** Run `yax auth device` again

## Documentation

- [GigaChat SKILL.md](./gigachat/SKILL.md) - Detailed setup and troubleshooting
- [YandexGPT SKILL.md](./yandexgpt/SKILL.md) - Proxy configuration
- [Yandex 360 SKILL.md](./yax/SKILL.md) - CalDAV implementation details

## Links

- **OpenClaw:** https://openclaw.ai
- **GigaChat API:** https://developers.sber.ru/docs/ru/gigachat/overview
- **YandexGPT API:** https://cloud.yandex.ru/docs/foundation-models/
- **Yandex 360:** https://oauth.yandex.ru/

---

**Created by [@smvlx](https://github.com/smvlx)** for OpenClaw agents
