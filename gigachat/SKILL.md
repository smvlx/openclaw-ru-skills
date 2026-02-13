# GigaChat Skill

Integrate GigaChat (Sber AI) with OpenClaw via gpt2giga proxy.

## Features

- ✅ Three models: GigaChat, GigaChat-Pro, GigaChat-Max
- ✅ OpenAI API compatibility
- ✅ Automatic token generation
- ✅ Multi-model support

## Prerequisites

1. **GigaChat API Access**:
   - Register at https://developers.sber.ru/
   - Create a GigaChat API application
   - Note your Client ID and Client Secret
   - Choose scope: `GIGACHAT_API_PERS` (free tier) or `GIGACHAT_API_CORP` (paid)

2. **Python & gpt2giga**:

   ```bash
   pip3 install gpt2giga
   ```

3. **Environment File**:
   Create `~/.openclaw/gigachat-new.env`:

   ```bash
   CLIENT_ID="your-client-id-here"
   CLIENT_SECRET="your-client-secret-here"

   # Auto-generate credentials (base64 of CLIENT_ID:CLIENT_SECRET)
   GIGACHAT_CREDENTIALS=$(echo -n "$CLIENT_ID:$CLIENT_SECRET" | base64)
   GIGACHAT_SCOPE="GIGACHAT_API_PERS"
   ```

## Quick Start

### 1. Start the proxy

```bash
/openclaw/skills/gigachat/scripts/start-proxy.sh
```

Output:

```
Generating GigaChat access token...
Token obtained successfully (expires in ~30min)
Starting gpt2giga proxy on port 8443...
✅ gpt2giga started successfully (PID: 12345)
   Log: /root/.openclaw/gpt2giga.log
   Endpoint: http://localhost:8443/v1/chat/completions

⚠️  Token expires in ~30 minutes. Restart this script to refresh.
```

### 2. Configure OpenClaw

Add to `openclaw.json`:

```json
{
  "models": {
    "providers": {
      "gigachat": {
        "baseUrl": "http://127.0.0.1:8443",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          {
            "id": "GigaChat-Max",
            "name": "GigaChat MAX",
            "contextWindow": 32768,
            "maxTokens": 8192
          },
          {
            "id": "GigaChat-Pro",
            "name": "GigaChat Pro",
            "contextWindow": 32768,
            "maxTokens": 4096
          },
          {
            "id": "GigaChat",
            "name": "GigaChat Lite",
            "contextWindow": 8192,
            "maxTokens": 2048
          }
        ]
      }
    }
  }
}
```

### 3. Test

```bash
curl -s -X POST http://localhost:8443/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "GigaChat-Max",
    "messages": [{"role": "user", "content": "Привет!"}]
  }' | jq -r '.choices[0].message.content'
```

Expected output:

```
Привет! Как дела?
```

## Creating an Agent

Add a GigaChat-powered agent to `openclaw.json`:

```json
{
  "agents": {
    "list": [
      {
        "id": "ruslan",
        "name": "Ruslan",
        "emoji": "🐻",
        "model": "gigachat/GigaChat-Pro",
        "workspace": "/root/.openclaw/agents/ruslan/workspace"
      }
    ]
  }
}
```

Create agent workspace:

```bash
mkdir -p /root/.openclaw/agents/ruslan/workspace
```

**IDENTITY.md**:

```markdown
# IDENTITY.md

- Name: Ruslan
- Creature: Российский AI-ассистент
- Vibe: Дружелюбный, знает русский контекст
- Emoji: 🐻
```

**SOUL.md**:

```markdown
# SOUL.md — Кто ты

Ты Руслан. Российский AI-ассистент на базе GigaChat.

Говоришь на русском, знаешь русский контекст (кухня, культура, реалии).
Отвечаешь кратко и по делу. Без лишней вежливости.
```

## Token Management

**Token Lifespan:** ~30 minutes  
**When to Refresh:** Before token expires

### Manual Refresh:

```bash
/openclaw/skills/gigachat/scripts/start-proxy.sh
```

### Auto-Refresh (via cron):

```bash
# Add to crontab: restart proxy every 25 minutes
*/25 * * * * /openclaw/skills/gigachat/scripts/start-proxy.sh
```

## Troubleshooting

### Issue: 401 Unauthorized

**Cause:** Token expired or invalid credentials  
**Fix:** Restart proxy script (generates fresh token)

### Issue: 402 Payment Required

**Cause:** Quota exhausted for that model  
**Fix:** Try a different model or wait for quota reset

- Free tier: Limits per model
- Strategy: Rotate between Max → Pro → Lite

### Issue: Process defunct / zombie

**Cause:** gpt2giga crashes but holds port  
**Fix:**

```bash
fuser -k 8443/tcp
/openclaw/skills/gigachat/scripts/start-proxy.sh
```

### Issue: "Can't decode Authorization header"

**Cause:** Using `--gigachat.credentials` flag (known bug)  
**Fix:** Use access token instead (startup script handles this)

## Architecture

```
OpenClaw → http://localhost:8443/v1/chat/completions
           ↓
       gpt2giga (proxy)
           ↓
   Sber GigaChat API (OAuth token auth)
```

**Flow:**

1. Startup script generates OAuth token from Client ID/Secret
2. gpt2giga starts with access token
3. OpenClaw sends OpenAI-format requests
4. gpt2giga translates to GigaChat format
5. Responses translated back to OpenAI format

## Files

- `scripts/start-proxy.sh` — Startup script with token generation
- `scripts/setup.sh` — Create env template
- `SKILL.md` — This file

## Limitations

- **Token Expiry:** Tokens expire in ~30 minutes
- **Free Tier Quotas:** Limited tokens per model
- **SSL Verification:** Disabled (`--verify-ssl-certs false`) due to Sber's custom CA
- **Credentials Security:** CLI args visible in `ps aux` → startup script uses env vars

## References

- GigaChat Docs: https://developers.sber.ru/docs/ru/gigachat/overview
- gpt2giga: https://pypi.org/project/gpt2giga/
- OpenClaw: https://openclaw.ai
