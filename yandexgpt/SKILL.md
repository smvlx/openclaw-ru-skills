# YandexGPT Proxy

OpenAI-compatible translation proxy for Yandex Cloud Foundation Models (YandexGPT).

## What it does

Runs a local HTTP proxy on port 8444 that accepts OpenAI-format API calls and translates them to the YandexGPT API. Zero external dependencies — pure Node.js.

## Supported Models

| Model          | YandexGPT Model URI                   |
| -------------- | ------------------------------------- |
| yandexgpt      | gpt://FOLDER_ID/yandexgpt/latest      |
| yandexgpt-lite | gpt://FOLDER_ID/yandexgpt-lite/latest |
| yandexgpt-32k  | gpt://FOLDER_ID/yandexgpt-32k/latest  |

## Setup

1. Get a Yandex Cloud API key and folder ID
2. Save to `~/.openclaw/yandexgpt.env`:
   ```
   YANDEX_API_KEY=your_api_key
   YANDEX_FOLDER_ID=your_folder_id
   YANDEX_PROXY_PORT=8444
   ```
3. Run `scripts/setup.sh`
4. Run `scripts/start.sh`
5. Run `scripts/patch-config.sh` to add to OpenClaw config

## Endpoints

- `GET /v1/models` — List available models
- `POST /v1/chat/completions` — Chat completion (OpenAI format)

## Scripts

- `scripts/setup.sh` — Create env file template
- `scripts/start.sh` — Start proxy
- `scripts/stop.sh` — Stop proxy
- `scripts/status.sh` — Check status
- `scripts/patch-config.sh` — Add YandexGPT to openclaw.json
