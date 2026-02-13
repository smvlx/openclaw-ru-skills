# yax — Yandex 360 CLI

CLI tool for Yandex Disk, Calendar, and Mail via Yandex OAuth API.

## Features

- **Disk**: info, list, mkdir, upload, download
- **Calendar**: list calendars, create events (via CalDAV)
- **Mail**: ⚠️ Limited — Yandex has no public HTTP API for mail (IMAP/SMTP only, ports often blocked in cloud)

## Prerequisites

1. Create a Yandex OAuth app at https://oauth.yandex.ru/client/new
   - Redirect URI: `https://oauth.yandex.ru/verification_code`
   - Required scopes:
     - `cloud_api:disk.app_folder` — Disk app folder access
     - `cloud_api:disk.info` — Disk info
     - `calendar:all` — Calendar read/write
     - `mail:smtp` — Mail sending (SMTP only, no HTTP API)
   - Note the Client ID and Client Secret

2. Save config to `~/.openclaw/yax.env`:
   ```
   YAX_CLIENT_ID=your_app_client_id
   YAX_CLIENT_SECRET=your_app_secret_if_any
   ```

## Setup & Auth

```bash
scripts/setup.sh        # Create env template
node src/yax.cjs auth   # OAuth flow (opens browser URL, paste code)
```

## Usage

```bash
# Disk
node src/yax.cjs disk info
node src/yax.cjs disk list /
node src/yax.cjs disk mkdir /test-folder
node src/yax.cjs disk upload ./local-file.txt /remote-path.txt
node src/yax.cjs disk download /remote-path.txt ./local-file.txt

# Calendar
node src/yax.cjs calendar list
node src/yax.cjs calendar create "Meeting" "2026-02-14" "11:00:00" "12:00:00" "Holiday meeting" "Europe/Moscow"

# Mail (informational only)
node src/yax.cjs mail
```

## Implementation Details

- **Calendar**: Uses raw CalDAV HTTP requests to `caldav.yandex.ru`. Automatically discovers user login via OAuth info endpoint and calendar paths via PROPFIND. Supports timezone-aware event creation. No external dependencies.
- **Mail**: Yandex does not offer a public REST/HTTP API for mail operations. Only IMAP/SMTP is available, which requires direct TCP connections on ports 993/465 — typically blocked in cloud environments (Railway, etc.). The Yandex 360 Admin API exists for organization accounts but is not suitable for personal use.

## Scripts

- `scripts/setup.sh` — Create env template
- `scripts/start.sh` — N/A (CLI tool, not a daemon)
- `scripts/stop.sh` — N/A
- `scripts/status.sh` — Check auth status
