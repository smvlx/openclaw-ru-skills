#!/usr/bin/env python3
"""Yandex Mail helper via IMAP/XOAUTH2 and SMTP (Python stdlib only)."""
import base64
import email
import imaplib
import json
import os
import re
import smtplib
import sys
import time
import urllib.request
from email.header import decode_header
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

TOKEN_FILE = os.path.expanduser("~/.openclaw/yax-token.json")
IMAP_HOST = "imap.yandex.ru"
SMTP_HOST = "smtp.yandex.ru"


def fail(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)


# --- Token / identity -------------------------------------------------------

def load_token():
    """Same checks as getToken() in yax.cjs: file present, access_token, not expired."""
    if not os.path.exists(TOKEN_FILE):
        fail("Not authenticated. Run: yax auth")
    try:
        with open(TOKEN_FILE) as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        fail(f"Cannot read token file {TOKEN_FILE}: {e}")
    token = data.get("access_token")
    if not token:
        fail("Not authenticated. Run: yax auth")
    issued = data.get("issued_at") or 0
    expires_in = data.get("expires_in") or 31536000
    if issued and time.time() >= issued + expires_in:
        fail("Token expired. Run: yax auth")
    return token


def get_email_address(token):
    """Resolve the mailbox address of the token owner (never hardcode it)."""
    req = urllib.request.Request(
        "https://login.yandex.ru/info?format=json",
        headers={"Authorization": f"OAuth {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            info = json.load(res)
    except Exception as e:  # network / HTTP / JSON
        fail(f"Cannot resolve account for token (login.yandex.ru/info): {e}")
    addr = info.get("default_email")
    if not addr and info.get("login"):
        addr = f"{info['login']}@yandex.ru"
    if not addr:
        fail("Cannot determine mailbox address for token (missing login:email scope?)")
    return addr


def xoauth2_string(user, token):
    return f"user={user}\x01auth=Bearer {token}\x01\x01"


def get_mail():
    token = load_token()
    email_addr = get_email_address(token)
    mail = imaplib.IMAP4_SSL(IMAP_HOST, 993)
    try:
        mail.authenticate("XOAUTH2", lambda _: xoauth2_string(email_addr, token).encode())
    except imaplib.IMAP4.error as e:
        fail(f"IMAP auth failed for {email_addr}: {e}\n"
             "Check that the OAuth app has the mail:imap_full scope and re-run: yax auth")
    return mail


# --- IMAP modified UTF-7 (RFC 3501 §5.1.3) ----------------------------------

def imap_utf7_decode(s):
    out = []
    i = 0
    while i < len(s):
        if s[i] != "&":
            out.append(s[i])
            i += 1
            continue
        j = s.find("-", i)
        if j == -1:
            j = len(s)
        chunk = s[i + 1:j]
        if chunk == "":
            out.append("&")
        else:
            b64 = chunk.replace(",", "/")
            b64 += "=" * (-len(b64) % 4)
            try:
                out.append(base64.b64decode(b64).decode("utf-16-be"))
            except Exception:
                out.append(s[i:j + 1])
        i = j + 1
    return "".join(out)


def imap_utf7_encode(s):
    out, buf = [], []

    def flush():
        if buf:
            b64 = base64.b64encode("".join(buf).encode("utf-16-be")).decode("ascii").rstrip("=")
            out.append("&" + b64.replace("/", ",") + "-")
            buf.clear()

    for ch in s:
        if 0x20 <= ord(ch) <= 0x7E:
            flush()
            out.append("&-" if ch == "&" else ch)
        else:
            buf.append(ch)
    flush()
    return "".join(out)


def quote_mailbox(name):
    """Encode a (possibly Cyrillic) folder name for use in IMAP commands."""
    enc = imap_utf7_encode(name)
    return '"' + enc.replace("\\", "\\\\").replace('"', '\\"') + '"'


def select_folder(mail, folder, readonly=False):
    try:
        status, data = mail.select(quote_mailbox(folder), readonly=readonly)
    except imaplib.IMAP4.error as e:
        status, data = "NO", [str(e).encode()]
    if status != "OK":
        detail = data[0].decode(errors="replace") if data and data[0] else ""
        fail(f"❌ Cannot open folder: {folder} {detail}".rstrip())
    return int(data[0]) if data and data[0] and data[0].isdigit() else 0


# --- Parsing helpers ----------------------------------------------------------

def decode_str(s):
    if not s:
        return ""
    result = []
    for part, enc in decode_header(s):
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)


def format_date(raw):
    if not raw:
        return "(no date)"
    try:
        return parsedate_to_datetime(raw).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return raw[:16]


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.result = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = False
        if tag in ("p", "div", "br"):
            self.result.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.result.append(data)


def strip_html(text):
    try:
        parser = TextExtractor()
        parser.feed(text)
        text = "".join(parser.result)
    except Exception:
        text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:3000]


def get_body(msg):
    for part in msg.walk():
        ct = part.get_content_type()
        if ct in ("text/plain", "text/html"):
            charset = part.get_content_charset() or "utf-8"
            payload = part.get_payload(decode=True)
            if payload:
                text = payload.decode(charset, errors="replace")
                if ct == "text/html":
                    text = strip_html(text)
                return text[:2000]
    return "(no text body)"


_BAD_FS_CHARS = re.compile(r'[\x00-\x1f\x7f/\\:*?"<>|]')


def safe_filename(name):
    """Reduce an attacker-controlled MIME filename to a safe basename."""
    name = (name or "").replace("\\", "/")
    name = os.path.basename(name)
    name = _BAD_FS_CHARS.sub("_", name).strip().strip(".")
    if not name or name in (".", ".."):
        name = "attachment"
    return name[:200]


def unique_path(directory, filename):
    base, ext = os.path.splitext(filename)
    candidate = os.path.join(directory, filename)
    n = 1
    while os.path.exists(candidate):
        candidate = os.path.join(directory, f"{base} ({n}){ext}")
        n += 1
    return candidate


def save_attachment(output_dir, filename, content):
    os.makedirs(output_dir, exist_ok=True)
    real_dir = os.path.realpath(output_dir)
    filepath = unique_path(real_dir, safe_filename(filename))
    if os.path.dirname(os.path.realpath(filepath)) != real_dir:
        fail(f"❌ Refusing to write outside {output_dir}: {filename}")
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


def get_attachments(msg):
    """Return [(filename, content, content_type)] for attachment parts."""
    attachments = []
    for part in msg.walk():
        if part.get_content_disposition() == "attachment":
            filename = safe_filename(decode_str(part.get_filename()))
            payload = part.get_payload(decode=True)
            if payload:
                attachments.append((filename, payload, part.get_content_type()))
    return attachments


# --- IMAP fetch helpers ---------------------------------------------------------

def parse_uid(uid):
    uid = str(uid).strip()
    if not uid.isdigit():
        fail(f"❌ Invalid UID: {uid!r} (use the numeric UID shown by `mail list`)")
    return uid


def fetch_message(mail, folder, uid, peek=False):
    """Fetch one message by UID. Returns an email.message.Message or exits."""
    uid = parse_uid(uid)
    select_folder(mail, folder, readonly=peek)
    item = "(BODY.PEEK[])" if peek else "(RFC822)"
    status, msg_data = mail.uid("FETCH", uid, item)
    raw = None
    if status == "OK":
        for entry in msg_data:
            if isinstance(entry, tuple) and len(entry) > 1 and entry[1]:
                raw = entry[1]
                break
    if raw is None:
        fail(f"❌ Message not found: UID {uid} in {folder}")
    return email.message_from_bytes(raw)


def fetch_headers(mail, total, limit):
    """One ranged FETCH of UID + a few headers for the last `limit` messages.
    BODY.PEEK does not set \\Seen; nothing but headers is transferred."""
    if total == 0 or limit <= 0:
        return []
    start = max(1, total - limit + 1)
    status, data = mail.fetch(f"{start}:*", "(UID BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE)])")
    if status != "OK":
        fail("❌ FETCH failed")
    rows = []
    for entry in data:
        if not (isinstance(entry, tuple) and len(entry) > 1 and entry[1]):
            continue
        m = re.search(rb"UID (\d+)", entry[0])
        if not m:
            continue
        hdr = email.message_from_bytes(entry[1])
        rows.append((m.group(1).decode(), hdr))
    return rows


# --- Commands -----------------------------------------------------------------

def cmd_list(folder, limit=10):
    mail = get_mail()
    total = select_folder(mail, folder, readonly=True)
    print(f"📬 {folder}: {total} messages (showing last {min(limit, total)})")
    for uid, hdr in fetch_headers(mail, total, limit):
        subj = decode_str(hdr["Subject"]) or "(no subject)"
        sender = decode_str(hdr["From"]) or "(unknown sender)"
        if len(sender) > 40:
            sender = sender[:37] + "..."
        print(f"  [{uid}] {format_date(hdr['Date'])} | {sender}")
        print(f"         {subj[:60]}")


def cmd_read(uid, folder="INBOX"):
    msg = fetch_message(get_mail(), folder, uid)
    print(f"From: {decode_str(msg['From'])}")
    print(f"To: {decode_str(msg.get('To', ''))}")
    print(f"Date: {msg['Date'] or '(no date)'}")
    print(f"Subject: {decode_str(msg['Subject'])}")
    print(f"\n{get_body(msg)}")


def cmd_delete(uid, folder="INBOX"):
    uid = parse_uid(uid)
    mail = get_mail()
    select_folder(mail, folder)
    status, data = mail.uid("FETCH", uid, "(FLAGS)")
    if status != "OK" or not data or data[0] is None:
        fail(f"❌ Message not found: UID {uid} in {folder}")
    status, _ = mail.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
    if status != "OK":
        fail(f"❌ Delete failed for UID {uid}")
    mail.expunge()
    print(f"✅ Deleted message {uid}")


def cmd_attachments(uid, folder="INBOX"):
    attachments = get_attachments(fetch_message(get_mail(), folder, uid, peek=True))
    if not attachments:
        print("📎 Нет вложений")
        return
    print(f"📎 Вложения ({len(attachments)}):")
    for i, (filename, content, _ct) in enumerate(attachments):
        print(f"  [{i}] {filename} ({len(content) / 1024:.1f} KB)")


def cmd_download(uid, attachment_name, folder="INBOX", output_dir="."):
    attachments = get_attachments(fetch_message(get_mail(), folder, uid, peek=True))
    wanted = safe_filename(attachment_name)
    for filename, content, _ct in attachments:
        if filename == wanted:
            print(f"✅ Saved: {save_attachment(output_dir, filename, content)}")
            return
    fail(f"❌ Attachment '{attachment_name}' not found")


def cmd_download_all(uid, folder="INBOX", output_dir="./attachments"):
    attachments = get_attachments(fetch_message(get_mail(), folder, uid, peek=True))
    if not attachments:
        print("📎 Нет вложений")
        return
    for filename, content, _ct in attachments:
        print(f"✅ {save_attachment(output_dir, filename, content)}")


def cmd_send(to, subject, body):
    token = load_token()
    email_from = get_email_address(token)
    msg = EmailMessage()
    msg["From"] = email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    challenge_seen = []

    def authobject(challenge=None):
        # Initial response carries the XOAUTH2 string; a 334 challenge means the
        # server rejected it and sent a base64 JSON error — answer with an empty line.
        if challenge is None:
            return xoauth2_string(email_from, token)
        challenge_seen.append(challenge)
        return ""

    try:
        with smtplib.SMTP(SMTP_HOST, 587, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.auth("XOAUTH2", authobject)
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError as e:
        detail = challenge_seen[0].decode(errors="replace") if challenge_seen else str(e)
        fail(f"❌ SMTP auth failed for {email_from}: {detail}\n"
             "Check that the OAuth app has the mail:smtp scope and re-run: yax auth")
    except Exception as e:
        fail(f"❌ Ошибка: {type(e).__name__}: {e}")
    print(f"✅ Письмо отправлено → {to}")


_LIST_RE = re.compile(rb'^\((?P<flags>[^)]*)\)\s+(?:"(?P<delim>(?:\\.|[^"\\])*)"|NIL)\s+(?P<name>.*)$')
_SPECIAL_USE = {
    "\\inbox": "📥",
    "\\sent": "📤",
    "\\drafts": "📝",
    "\\junk": "🚫",
    "\\trash": "🗑️",
    "\\archive": "📦",
}


def parse_list_line(line):
    """Parse one LIST response line into (flags, decoded_name) or None."""
    m = _LIST_RE.match(line.strip())
    if not m:
        return None
    flags = [f.decode(errors="replace").lower() for f in m.group("flags").split()]
    raw = m.group("name").strip()
    if raw.startswith(b'"') and raw.endswith(b'"'):
        raw = raw[1:-1].replace(b'\\"', b'"').replace(b"\\\\", b"\\")
    return flags, imap_utf7_decode(raw.decode("ascii", errors="replace"))


def cmd_folders():
    mail = get_mail()
    status, data = mail.list()
    if status != "OK":
        fail("❌ LIST failed")
    for item in data:
        if not isinstance(item, bytes):
            continue
        parsed = parse_list_line(item)
        if not parsed:
            continue
        flags, name = parsed
        if "\\noselect" in flags:
            continue
        marker = "📥" if name.upper() == "INBOX" else "📁"
        for flag, emoji in _SPECIAL_USE.items():
            if flag in flags:
                marker = emoji
                break
        print(f"  {marker} {name}")


# --- CLI ------------------------------------------------------------------------

USAGE = "Usage: mail.py [list [folder] [n] | read <uid> [folder] | delete <uid> [folder] | folders | " \
        "send <to> <subject> <body> | attachments <uid> [folder] | download <uid> <name> [folder] [dir] | " \
        "download_all <uid> [folder] [dir]]"


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "list"
    args = argv[2:]

    if cmd == "list":
        folder = args[0] if len(args) > 0 else "INBOX"
        limit = 10
        if len(args) > 1:
            if not args[1].isdigit() or int(args[1]) < 1:
                fail("Usage: mail.py list [folder] [n]  (n must be a positive integer)")
            limit = int(args[1])
        cmd_list(folder, limit)
    elif cmd == "read":
        if len(args) < 1:
            fail("Usage: mail.py read <uid> [folder]")
        cmd_read(args[0], args[1] if len(args) > 1 else "INBOX")
    elif cmd == "delete":
        if len(args) < 1:
            fail("Usage: mail.py delete <uid> [folder]")
        cmd_delete(args[0], args[1] if len(args) > 1 else "INBOX")
    elif cmd == "folders":
        cmd_folders()
    elif cmd == "send":
        if len(args) < 2:
            fail("Usage: mail.py send <to> <subject> <body>")
        cmd_send(args[0], args[1], args[2] if len(args) > 2 else "")
    elif cmd == "attachments":
        if len(args) < 1:
            fail("Usage: mail.py attachments <uid> [folder]")
        cmd_attachments(args[0], args[1] if len(args) > 1 else "INBOX")
    elif cmd == "download":
        if len(args) < 2:
            fail("Usage: mail.py download <uid> <attachment_name> [folder] [output_dir]")
        cmd_download(args[0], args[1], args[2] if len(args) > 2 else "INBOX", args[3] if len(args) > 3 else ".")
    elif cmd == "download_all":
        if len(args) < 1:
            fail("Usage: mail.py download_all <uid> [folder] [output_dir]")
        cmd_download_all(args[0], args[1] if len(args) > 1 else "INBOX", args[2] if len(args) > 2 else "./attachments")
    else:
        fail(USAGE)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except imaplib.IMAP4.error as e:
        fail(f"❌ IMAP error: {e}")
    except KeyboardInterrupt:
        sys.exit(130)
