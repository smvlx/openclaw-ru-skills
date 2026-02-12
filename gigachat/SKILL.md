# GigaChat Proxy

OpenAI-compatible proxy for Sber GigaChat, powered by [gpt2giga](https://github.com/ai-forever/gpt2giga).

## What it does

Runs a local HTTP proxy on port 8443 that translates OpenAI API calls to GigaChat API, enabling any OpenAI-compatible client (including OpenClaw) to use GigaChat models.

## Supported Models

| Model | Description |
|-------|-------------|
| GigaChat | Standard model |
| GigaChat-Pro | Enhanced model |
| GigaChat-Max | Most capable model |

## Setup

1. Get GigaChat API credentials from [developers.sber.ru](https://developers.sber.ru/portal/products/gigachat-api)
2. Save credentials to `~/.openclaw/gigachat.env`:
   ```
   GIGACHAT_CREDENTIALS=your_credentials_here
   GIGACHAT_SCOPE=GIGACHAT_API_PERS
   ```
3. Run `scripts/setup.sh` to install dependencies
4. Run `scripts/start.sh` to start the proxy
5. Run `scripts/patch-config.sh` to add GigaChat to OpenClaw config

## Usage

```bash
curl http://localhost:8443/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"GigaChat","messages":[{"role":"user","content":"Привет!"}]}'
```

## Scripts

- `scripts/setup.sh` — Install gpt2giga
- `scripts/start.sh` — Start proxy (port 8443)
- `scripts/stop.sh` — Stop proxy
- `scripts/status.sh` — Check proxy status
- `scripts/patch-config.sh` — Add GigaChat provider to openclaw.json
