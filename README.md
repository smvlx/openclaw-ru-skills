# OpenClaw Russian AI Skills

Three skills that give your OpenClaw agent access to Russian AI services: **GigaChat** (Sber), **YandexGPT**, and **Yandex 360** (Disk, Calendar, Mail & Telemost).

## What This Enables

Talk to your agent in natural language — it handles the rest:

| You say | Agent does |
|---------|-----------|
| *"Answer in Russian using GigaChat-Max: Что такое квантовые вычисления?"* | Routes request through GigaChat proxy → Sber API |
| *"Summarize this file with YandexGPT"* | Sends content through YandexGPT proxy → Yandex Foundation Models |
| *"Upload report.pdf to Yandex Disk"* | Runs `yax disk upload` via CLI |
| *"Create a meeting tomorrow at 14:00 Moscow time"* | Runs `yax calendar create` with timezone |
| *"Create a Telemost meeting for the team"* | Runs `yax telemost create` via Telemost API |
| *"Spawn a Russian-speaking subagent to proofread this text"* | Creates a GigaChat-Pro or YandexGPT subagent |

---

## Installation

One command:

```bash
openclaw skills add https://github.com/smvlx/openclaw-ru-skills
```

OpenClaw auto-discovers all three skills. No manual cloning required.

---

## Setup

Each skill needs **credentials from external services** — that's the only part you do manually. Everything else (config files, installations, proxy startup, OpenClaw configuration) **your agent handles**.

### 🤖 GigaChat (Sber AI)

<table>
<tr><td width="50%">

**👤 You do once (2 min)**

1. Register at [developers.sber.ru](https://developers.sber.ru/)
2. Create a GigaChat API application
3. Copy **Client ID** and **Client Secret**
4. Choose scope: `GIGACHAT_API_PERS` (free) or `GIGACHAT_API_CORP` (paid)
5. Give credentials to your agent

</td><td width="50%">

**🤖 Agent automates**

```bash
# Create env file
cat > ~/.openclaw/gigachat-new.env << 'EOF'
CLIENT_ID="<your-id>"
CLIENT_SECRET="<your-secret>"
GIGACHAT_CREDENTIALS=$(echo -n "$CLIENT_ID:$CLIENT_SECRET" | base64)
GIGACHAT_SCOPE="GIGACHAT_API_PERS"
EOF

# Install proxy dependency
pip3 install gpt2giga

# Start proxy (localhost:8443)
/openclaw/skills/openclaw-ru-skills/gigachat/scripts/start-proxy.sh

# Register provider in OpenClaw
openclaw gateway config.patch '{
  "models": {
    "providers": {
      "gigachat": {
        "baseUrl": "http://127.0.0.1:8443",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          {"id": "GigaChat-Max", "name": "GigaChat MAX"},
          {"id": "GigaChat-Pro", "name": "GigaChat Pro"},
          {"id": "GigaChat", "name": "GigaChat Lite"}
        ]
      }
    }
  }
}'
```

</td></tr>
</table>

**Models available:** GigaChat Lite · GigaChat Pro · GigaChat MAX

---

### 🦊 YandexGPT (Foundation Models)

<table>
<tr><td width="50%">

**👤 You do once (3 min)**

1. Go to [Yandex Cloud Console](https://console.cloud.yandex.ru/iam)
2. Create a service account
3. Grant role `ai.languageModels.user`
4. Create an API key
5. Note your **Folder ID** and **API Key**
6. Give credentials to your agent

</td><td width="50%">

**🤖 Agent automates**

```bash
# Create env file
cat > ~/.openclaw/yandexgpt.env << 'EOF'
YANDEX_API_KEY="<your-api-key>"
YANDEX_FOLDER_ID="<your-folder-id>"
YANDEX_PROXY_PORT="8444"
EOF

# Start proxy (localhost:8444)
/openclaw/skills/openclaw-ru-skills/yandexgpt/scripts/start.sh

# Register provider in OpenClaw
openclaw gateway config.patch '{
  "models": {
    "providers": {
      "yandexgpt": {
        "baseUrl": "http://127.0.0.1:8444",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          {"id": "yandexgpt", "name": "YandexGPT"},
          {"id": "yandexgpt-lite", "name": "YandexGPT Lite"},
          {"id": "yandexgpt-32k", "name": "YandexGPT 32K"}
        ]
      }
    }
  }
}'
```

</td></tr>
</table>

**Models available:** YandexGPT Lite · YandexGPT · YandexGPT 32K

---

### 📁📅📧📹 Yandex 360 (Disk, Calendar, Mail & Telemost)

<table>
<tr><td width="50%">

**👤 You do once (3 min)**

1. Create an OAuth app at [oauth.yandex.ru/client/new](https://oauth.yandex.ru/client/new)
2. Set redirect URI: `https://oauth.yandex.ru/verification_code`
3. Enable scopes:
   - `cloud_api:disk.app_folder`
   - `cloud_api:disk.info`
   - `calendar:all`
   - `telemost-api:conferences.create`
4. Note **Client ID** (and Secret if applicable)
5. Give credentials to your agent

</td><td width="50%">

**🤖 Agent automates**

```bash
# Create env file
cat > ~/.openclaw/yax.env << 'EOF'
YAX_CLIENT_ID="<your-client-id>"
YAX_CLIENT_SECRET="<your-secret-if-any>"
EOF

# Authenticate (device code flow)
cd /openclaw/skills/openclaw-ru-skills/yax
node src/yax.cjs auth device
# Agent shows you a URL + code to confirm
```

</td></tr>
</table>

After auth, the agent can run any `yax` command directly — no further setup needed. All four services (Disk, Calendar, Mail, Telemost) use the same OAuth token.

---

## Agent Usage

### GigaChat & YandexGPT — as models

Once configured, use them like any other model:

> *"Switch to GigaChat-Max and explain quantum computing in Russian"*
>
> *"Use YandexGPT-32K to summarize this document"*
>
> *"Compare GigaChat-Pro and YandexGPT responses to this prompt"*

### GigaChat & YandexGPT — as subagents

Create Russian-speaking subagents powered by these models:

> *"Spawn a subagent on GigaChat-Pro to proofread this Russian text"*
>
> *"Create a YandexGPT subagent to translate this article into Russian"*

Behind the scenes, the agent can register a persistent subagent:

```bash
openclaw gateway config.patch '{
  "agents": {
    "list": [{
      "id": "ruslan",
      "name": "Ruslan",
      "emoji": "🐻",
      "model": "gigachat/GigaChat-Pro",
      "workspace": "~/.openclaw/agents/ruslan/workspace"
    }]
  }
}'
```

### Yandex Disk

> *"Upload today's report to Yandex Disk"*
>
> *"Download /docs/contract.pdf from Yandex Disk"*
>
> *"Create a folder called 'backups' on Yandex Disk"*
>
> *"Show how much space is left on my Yandex Disk"*

What the agent executes:

```bash
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs disk upload ./report.md /reports/report.md
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs disk download /docs/contract.pdf ./contract.pdf
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs disk mkdir /backups
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs disk info
```

### Yandex Calendar

> *"Create a meeting for tomorrow at 2pm Moscow time: Standup with the team"*
>
> *"List my calendars"*

What the agent executes:

```bash
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs calendar create \
  "Standup with the team" "2026-02-14" "14:00:00" "14:30:00" \
  "Daily standup" "Europe/Moscow"

node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs calendar list
```

### Yandex Mail

> Works via IMAP/SMTP. Note: ports 993 (IMAP) and 465 (SMTP) are blocked on some cloud hosts like Railway.

> *"Check mail info"*

What the agent executes:

```bash
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs mail
# Shows IMAP/SMTP connection details and host compatibility info
```

Yandex Mail uses standard IMAP/SMTP protocols rather than an HTTP API. This works on any host with open mail ports (VPS, dedicated servers, local machines). Cloud PaaS providers (Railway, Render, etc.) may block these ports — run `node src/yax.cjs mail` to check your environment.

### Yandex Telemost (Video Conferences)

> Works with a paid Yandex 360 subscription.

> *"Create a Telemost meeting for tomorrow's standup"*

What the agent executes:

```bash
node /openclaw/skills/openclaw-ru-skills/yax/src/yax.cjs telemost create
```

Telemost lets you create and manage video conferences programmatically. The OAuth scope `telemost-api:conferences.create` is included in the setup. Requires an active Yandex 360 for Business subscription — free/personal Yandex accounts don't have Telemost API access.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          OpenClaw Agent                              │
│                                                                      │
│  "Use GigaChat"    "Use YandexGPT"    "Upload to Disk"              │
│       │                  │              "Create meeting"             │
│       │                  │              "Check mail"                 │
│       │                  │                   │                       │
└───────┼──────────────────┼───────────────────┼───────────────────────┘
        │                  │                   │
        ▼                  ▼                   ▼
  ┌───────────┐    ┌────────────┐    ┌──────────────────────┐
  │ gpt2giga  │    │ Node.js    │    │  yax CLI             │
  │ proxy     │    │ proxy      │    │  (no daemon)         │
  │ :8443     │    │ :8444      │    │                      │
  └─────┬─────┘    └─────┬──────┘    └──┬─────┬─────┬────┬─┘
        │                │              │     │     │    │
        ▼                ▼              ▼     ▼     ▼    ▼
   Sber GigaChat    Yandex Cloud   Yandex Yandex  IMAP  Telemost
   API (OAuth)      Foundation     Disk   CalDAV  /SMTP  API
                    Models API     API
```

**GigaChat & YandexGPT proxies** translate OpenAI-format requests (`/v1/chat/completions`) to native APIs, so OpenClaw treats them like any OpenAI-compatible provider.

**yax** is a CLI tool (not a daemon) — the agent calls it directly for each Disk, Calendar, Mail, and Telemost operation.

---

## Security

- 🔒 Credentials stored in `~/.openclaw/*.env` with `0600` permissions
- 🔒 Proxies bind to `127.0.0.1` only — no external access
- 🔒 GigaChat tokens auto-generated via OAuth (expire in ~30 min)
- 🔒 Yandex 360 uses OAuth device code flow — no passwords stored
- 🔒 Cross-platform: Linux & macOS

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| GigaChat `401 Unauthorized` | Token expired (~30 min lifespan) | Agent restarts `start-proxy.sh` |
| GigaChat `402 Payment Required` | Model quota exhausted | Switch model: Max → Pro → Lite |
| GigaChat port busy | Zombie process holding `:8443` | `fuser -k 8443/tcp` then restart |
| YandexGPT `403 Forbidden` | Wrong folder ID | Check `~/.openclaw/yandexgpt.env` |
| YandexGPT proxy won't start | Port 8444 in use | `fuser -k 8444/tcp` then restart |
| Yandex 360 token expired | OAuth token needs refresh | Run `yax auth device` again |
| Mail IMAP/SMTP timeout | Ports 993/465 blocked by host | Deploy on a VPS or local machine |
| Telemost `403 Forbidden` | No paid Yandex 360 subscription | Upgrade to Yandex 360 for Business |
| `gpt2giga` not found | Not installed | `pip3 install gpt2giga` |

**Tip:** For GigaChat, set up auto-refresh via cron:

```bash
*/25 * * * * /openclaw/skills/openclaw-ru-skills/gigachat/scripts/start-proxy.sh
```

---

## Detailed Documentation

Each skill has its own `SKILL.md` with implementation details:

- [GigaChat SKILL.md](./gigachat/SKILL.md) — Token management, agent creation, model details
- [YandexGPT SKILL.md](./yandexgpt/SKILL.md) — Proxy internals, model URI mapping
- [Yandex 360 SKILL.md](./yax/SKILL.md) — Disk API, CalDAV, Mail (IMAP/SMTP), Telemost API, OAuth flow

---

## Links

- **OpenClaw** — [openclaw.ai](https://openclaw.ai)
- **GigaChat API** — [developers.sber.ru/docs/ru/gigachat/overview](https://developers.sber.ru/docs/ru/gigachat/overview)
- **gpt2giga** — [pypi.org/project/gpt2giga](https://pypi.org/project/gpt2giga/)
- **YandexGPT API** — [cloud.yandex.ru/docs/foundation-models](https://cloud.yandex.ru/docs/foundation-models/)
- **Yandex OAuth** — [oauth.yandex.ru](https://oauth.yandex.ru/)

---

Created by [@smvlx](https://github.com/smvlx) for OpenClaw agents
