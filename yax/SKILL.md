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
node src/yax.js auth    # OAuth flow (opens browser URL, paste code)
```

## Usage

```bash
# Disk
node src/yax.js disk info
node src/yax.js disk list /
node src/yax.js disk mkdir /test-folder
node src/yax.js disk upload ./local-file.txt /remote-path.txt
node src/yax.js disk download /remote-path.txt ./local-file.txt

# Calendar
node src/yax.js calendar list
node src/yax.js calendar create "Meeting" "2024-12-25" "14:00:00" "Holiday meeting"

# Mail (informational only)
node src/yax.js mail
```

## Limitations

- **Mail**: Yandex does not offer a public REST/HTTP API for mail operations. Only IMAP/SMTP is available, which requires direct TCP connections on ports 993/465 — typically blocked in cloud environments (Railway, etc.). The Yandex 360 Admin API exists for organization accounts but is not suitable for personal use.
- **Calendar**: Uses raw CalDAV HTTP requests to `caldav.yandex.ru`. No external dependencies.

## Scripts

- `scripts/setup.sh` — Create env template
- `scripts/start.sh` — N/A (CLI tool, not a daemon)
- `scripts/stop.sh` — N/A
- `scripts/status.sh` — Check auth status
