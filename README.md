# OpenClaw Russian AI Skills

Three OpenClaw skills for integrating Russian AI services: **GigaChat** (Sber), **YandexGPT**, and **Yandex 360** (Disk/Calendar).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🤖 **GigaChat** - Sber's AI models (Lite, Pro, Max) via OpenAI-compatible proxy
- 🦊 **YandexGPT** - Yandex Foundation Models (lite, default, 32k) via OpenAI-compatible proxy  
- 📁 **Yandex 360** - Disk (upload/download) and Calendar (create/list events) via OAuth

All skills use OAuth authentication and work on Linux & macOS.

## Quick Start

### Prerequisites

- Node.js 16+ (for yax)
- Python 3.8+ (for GigaChat proxy)
- OpenClaw installed ([openclaw.ai](https://openclaw.ai))

### Installation

```bash
cd ~/.openclaw/skills
git clone https://github.com/smvlx/openclaw-ru-skills.git
cd openclaw-ru-skills
```

### Setup

Each skill has its own setup script:

```bash
# GigaChat
./gigachat/scripts/setup.sh

# YandexGPT
./yandexgpt/scripts/setup.sh

# Yandex 360
./yax/scripts/setup.sh
```

Follow the prompts to configure API credentials and OAuth tokens.

## Usage

### GigaChat

**1. Start the proxy:**
```bash
./gigachat/scripts/start-proxy.sh
```

**2. Configure OpenClaw** (`~/.openclaw/openclaw.json`):
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

**3. Create an agent:**
```json
{
  "agents": {
    "list": [
      {
        "id": "ruslan",
        "name": "Ruslan",
        "emoji": "🐻",
        "model": "gigachat/GigaChat-Pro"
      }
    ]
  }
}
```

### YandexGPT

**1. Start the proxy:**
```bash
./yandexgpt/scripts/start.sh
```

**2. Configure OpenClaw:**
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

**3. Create an agent:**
```json
{
  "agents": {
    "list": [
      {
        "id": "yasha",
        "name": "Яша",
        "emoji": "🦊",
        "model": "yandexgpt/yandexgpt"
      }
    ]
  }
}
```

### Yandex 360 (Disk & Calendar)

**1. Authenticate:**
```bash
cd yax
node src/yax.cjs auth
```

**2. Use the CLI:**
```bash
# Disk operations
node src/yax.cjs disk info
node src/yax.cjs disk list /
node src/yax.cjs disk upload local.txt /remote.txt
node src/yax.cjs disk download /remote.txt local.txt

# Calendar operations
node src/yax.cjs calendar list
node src/yax.cjs calendar create "Meeting" "2026-02-14" "14:00:00" "15:00:00" "Description" "Europe/Moscow"
```

## Documentation

Each skill has detailed documentation in its `SKILL.md` file:

- [GigaChat Documentation](./gigachat/SKILL.md)
- [YandexGPT Documentation](./yandexgpt/SKILL.md)
- [Yandex 360 Documentation](./yax/SKILL.md)

## Architecture

```
OpenClaw
  ├─→ GigaChat Proxy (port 8443) ─→ Sber GigaChat API
  ├─→ YandexGPT Proxy (port 8444) ─→ Yandex Foundation Models API
  └─→ yax CLI ─→ Yandex 360 APIs (Disk/Calendar)
```

All proxies translate OpenAI-format requests to native API formats, enabling drop-in compatibility with OpenClaw.

## Security

- ✅ OAuth tokens stored with 0600 permissions (owner-only)
- ✅ Proxies bind to 127.0.0.1 (localhost only)
- ✅ Token expiry checking with warnings
- ✅ Input validation on file operations
- ⚠️ GigaChat uses `-k` flag for SSL (Sber custom CA) - documented in scripts

## Cross-Platform Support

All skills work on **Linux** and **macOS**:
- UUID generation: `uuidgen` → `/proc/sys/kernel/random/uuid` → Node.js fallback
- Port cleanup: `fuser` (Linux) → `lsof` (macOS) fallback
- PID files: standardized to `~/.openclaw/<skill>.pid`

## Troubleshooting

### GigaChat

**401 Unauthorized:**
- Token expired (30min lifespan)
- Solution: Restart `./gigachat/scripts/start-proxy.sh`

**402 Payment Required:**
- Quota exhausted for that model
- Solution: Try different model (Max → Pro → Lite) or wait for quota reset

### YandexGPT

**403 Forbidden:**
- Wrong `YANDEX_FOLDER_ID` in env file
- Solution: Check folder ID in Yandex Cloud console

### Yandex 360

**Token expired:**
- OAuth token lifespan varies (weeks to months)
- Solution: Run `node src/yax.cjs auth` to refresh

**Calendar timezone issues:**
- 15 timezones supported (see `yax/src/yax.cjs` for full list)
- Unknown timezones default to Europe/Moscow with warning

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Links

- **OpenClaw:** https://openclaw.ai
- **Documentation:** https://docs.openclaw.ai
- **GigaChat API:** https://developers.sber.ru/docs/ru/gigachat/overview
- **YandexGPT API:** https://cloud.yandex.ru/docs/foundation-models/
- **Yandex 360 API:** https://oauth.yandex.ru/

## Credits

Created for OpenClaw by [@smvlx](https://github.com/smvlx)

Special thanks to:
- Sber for GigaChat API
- Yandex for Foundation Models and 360 APIs
- OpenClaw community

---

**Need help?** Open an issue on GitHub or visit [OpenClaw Discord](https://discord.com/invite/clawd)
