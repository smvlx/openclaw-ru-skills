---
name: yax
description: CLI tool for Yandex Disk, Calendar, and Mail via Yandex OAuth API
version: 1.5.0
metadata: {"openclaw":{"emoji":"📁","homepage":"https://github.com/smvlx/awesome-ru-ai-skills","os":["darwin","linux"],"requires":{"bins":["node","python3"],"env":["YAX_CLIENT_ID"]},"primaryEnv":"YAX_CLIENT_ID","configPaths":["~/.openclaw/yax.env","~/.openclaw/yax-token.json"]}}
---

# yax — Yandex 360 CLI

CLI tool for Yandex Disk, Calendar, and Mail via Yandex OAuth API.

## Features

- **Disk**: info, list, mkdir, upload, download, **sync** (recursive, MD5-verified, resumable)
- **Calendar**: list calendars, list events, create/update/delete events (via CalDAV)
- **Mail**: IMAP via XOAUTH2 (folders, list, read, delete, **attachments**) and SMTP send. Requires `python3` (stdlib only)

## Prerequisites

1. Create a Yandex OAuth app at https://oauth.yandex.ru/client/new
   - Redirect URI: `https://oauth.yandex.ru/verification_code`
   - **Required scopes (критично для загрузки файлов):**
     - `cloud_api:disk.write` — ⚠️ Запись на диск (без этого НЕ работает upload!)
     - `cloud_api:disk.read` — Чтение информации о диске
     - `calendar:all` — Calendar read/write
     - `mail:imap_full` — Full IMAP access (read, delete)
     - `mail:smtp` — Mail sending via SMTP
   - Note the Client ID and Client Secret

2. Save config to `~/.openclaw/yax.env`:
   ```
   YAX_CLIENT_ID=your_app_client_id
   YAX_CLIENT_SECRET=your_app_secret_if_any
   ```

3. **После изменения scopes в приложении — обязательно переавторизуйся!**
   ```bash
   node src/yax.cjs auth
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

# Mirror a whole directory tree (recursive, MD5-verified, resumable)
node src/yax.cjs disk sync ./local-dir /remote-dir
node src/yax.cjs disk sync ./local-dir /remote-dir --jobs 4           # 4 uploads at once
node src/yax.cjs disk sync ./local-dir /remote-dir --dry-run          # plan only
node src/yax.cjs disk sync ./photos /backup/photos --exclude "*.tmp"  # extra excludes

# Calendar
node src/yax.cjs calendar list                         # список календарей
node src/yax.cjs calendar list-events                  # события в календаре (UID + название + время)
node src/yax.cjs calendar create "Meeting" "2026-02-14" "11:00:00" "12:00:00" "Description" "Europe/Moscow"  # создать
node src/yax.cjs calendar update "<uid>" "New Title" "2026-02-14" "12:00:00" "13:00:00" "Desc" "Europe/Moscow"   # обновить
node src/yax.cjs calendar delete "<uid>"               # удалить

# Mail
node src/yax.cjs mail folders              # список папок (имена декодированы, можно передавать в list)
node src/yax.cjs mail list INBOX 10        # последние 10 писем (UID, дата, отправитель, тема)
node src/yax.cjs mail list "Отправленные" 5
node src/yax.cjs mail read <uid> [folder]  # прочитать письмо
node src/yax.cjs mail delete <uid> [folder]  # удалить письмо
node src/yax.cjs mail send <to> <subject> <body>  # отправить письмо (From = владелец токена)
node src/yax.cjs mail attachments <uid>    # список вложений в письме
node src/yax.cjs mail download <uid> "file.pdf" [folder] [dir]  # скачать одно вложение (по умолчанию в текущую папку)
node src/yax.cjs mail download_all <uid> [folder] [dir]  # скачать все вложения (по умолчанию в ./attachments)
```

## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### [1.5.0] - 2026-09-09

#### Added
- `disk sync <local-dir> <remote-dir> [--dry-run] [--exclude NAME]` — mirrors a
  directory tree. Every file is verified by comparing its local MD5 against the
  `md5` Yandex reports for the stored resource, so a `201` alone is never treated
  as success. Resumable: a file whose MD5 already matches is skipped, so an
  interrupted run costs a checksum pass rather than a re-upload. Progress state
  lives in `~/.openclaw/yax-sync/<hash>.json` (mode 600). Exits non-zero if any
  file failed or was skipped as oversized, which makes it usable as a gate
  before deleting local originals.
- `--jobs N` on `disk sync` runs N uploads concurrently. Yandex throttles per
  connection rather than per account — measured 0.25 MB/s on one stream and
  0.505 MB/s on two (2.02x, near-linear), and 2.17 MB/s on five — so a single
  stream leaves most of the link idle. Defaults to 1, which is the previous
  behaviour.
- `disk sync` skips build and VCS noise by default (`node_modules`, `.venv`,
  `venv`, `__pycache__`, `.git`, `.next`, `.cache`, `.pytest_cache`, `.DS_Store`,
  `*.pyc`) and does not follow symlinks.

#### Fixed
- `disk upload` streams the file with `fs.createReadStream` instead of reading it
  fully into a Buffer via `readFileSync`. Uploading a multi-GB file previously
  allocated its entire size in memory; a 1.3 GB PDF now uploads with constant
  memory.
- `disk upload` reports failures instead of printing `Status: <code>` and exiting
  0, and explains a `ForbiddenError` as the missing `cloud_api:disk.write` scope.
- Per-file size limit is enforced up front (50 GB, the Yandex 360 cap) with a
  clear message, rather than failing mid-transfer with HTTP 413.
- Transient failures (5xx, 429, socket errors) retry with exponential backoff;
  4xx still fails immediately.
- `scripts/setup.sh` creates `~/.openclaw` if missing (it previously failed when
  the directory did not exist) and writes `yax.env` with mode 600 — the file
  holds an OAuth client secret and was world-readable.

### [1.4.1] - 2026-09-03

#### Fixed
- Mail: mailbox address is resolved from the OAuth token owner instead of being hardcoded
- Mail: all IMAP operations use message UIDs (`UID FETCH/STORE`); `delete` no longer hits the wrong message after an expunge
- Mail: attachment filenames are sanitised (no path traversal, no overwrite of same-named files)
- Mail: `list` fetches only headers with `BODY.PEEK` — no full bodies downloaded, no messages marked as read
- Mail: folder names are decoded with generic RFC 3501 modified UTF-7 (previous table mislabeled two folders); Cyrillic names accepted by `list/read/delete`
- Mail: SMTP auth uses `smtplib.SMTP.auth` and surfaces Yandex's error; missing/expired token, unknown UID and bad arguments give clear errors and non-zero exit codes
- Calendar: `update` preserves RRULE, ATTENDEE, ORGANIZER, VALARM, LOCATION etc., bumps SEQUENCE and sends `If-Match`
- Calendar: `update`/`delete` search all events calendars and URL-encode the UID; `delete` no longer reports 404 as success
- Calendar: `list-events` parses TZID, UTC and all-day dates correctly, handles LF-terminated ICS, and uses one `calendar-query` REPORT per calendar
- CLI: `yax mail ...` propagates `mail.py`'s exit code and explains when `python3` is missing; help lists all calendar and mail commands

### [1.4.0] - 2026-04-21

#### Added
- `mail attachments <uid>` — list attachments in email
- `mail download <uid> "filename"` — download single attachment
- `mail download_all <uid>` — download all attachments from email

### [1.3.1] - 2026-04-16

#### Added
- `mail send <to> <subject> <body>` — send email via SMTP + XOAUTH2 (port 587, STARTTLS)

### [1.3.0] - 2026-04-16

#### Added
- IMAP mail access via XOAUTH2: `mail folders`, `mail list`, `mail read`, `mail delete` (`src/mail.py`, Python stdlib)

### [1.2.0] - 2026-04-16

#### Added
- `calendar list-events`, `calendar update <uid> ...`, `calendar delete <uid>` via CalDAV
- URL encoding for CalDAV paths

### [1.1.0]

#### Added
- Calendar support via CalDAV: `calendar list`, `calendar create` with timezone-aware events

### [1.0.0]

#### Added
- Initial release
- Disk operations (info, list, mkdir, upload, download)

## Implementation Details

### Проблемы и решения

**Проблема:** `Upload URL error: { error: 'ForbiddenError' }`
**Причина:** OAuth-приложению не хватает scope `cloud_api:disk.write`
**Решение:** Добавь `cloud_api:disk.write` в scopes приложения на https://oauth.yandex.ru/client/your-app-id, затем переавторизуйся (`node src/yax.cjs auth`)

**Проблема:** Токен устарел / авторизация сбрасывается
**Решение:** Токен жив 1 год, но после изменения прав приложения нужна повторная авторизация. Старые токены остаются рабочими до истечения, но с новыми scopes — только после re-auth.

- **Calendar**: Uses raw CalDAV HTTP requests to `caldav.yandex.ru` (Node, no npm dependencies). Discovers the user login via the OAuth info endpoint and calendar collections via PROPFIND; `update`/`delete` look the UID up in every events calendar. `update` rewrites only DTSTART/DTEND/SUMMARY/DESCRIPTION of the master VEVENT and keeps everything else. Supports timezone-aware event creation.
- **Disk sync concurrency**: files are pulled from one shared cursor by N
  workers, so a slow large file never blocks the others. Progress is
  checkpointed every 20 completions regardless of which worker finished them.
- **Disk sync**: `disk sync` walks the tree, creates remote directories (tolerating the documented 409 "already exists"), requests a per-file upload href and streams the body to it. Verification re-reads the resource metadata and compares `md5`; a mismatch is reported as a failure rather than logged and forgotten. State is keyed by a hash of the remote root, so two different syncs never share a resume file.
- **Mail**: `src/mail.py` — IMAP/SMTP via XOAUTH2 using only the Python 3 stdlib (`imaplib`, `smtplib`, `email`); no pip packages, but `python3` must be installed. The mailbox address is taken from the token owner (`login.yandex.ru/info`). Requires `mail:imap_full` (and `mail:smtp` for `send`) OAuth scopes. Message identifiers are IMAP UIDs, stable within a folder.

## Scripts

- `scripts/setup.sh` — Create env template
- `scripts/start.sh` — N/A (CLI tool, not a daemon)
- `scripts/stop.sh` — N/A
- `scripts/status.sh` — Check auth status
