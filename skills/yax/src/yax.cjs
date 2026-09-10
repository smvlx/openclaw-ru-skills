#!/usr/bin/env node
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const TOKEN_FILE = path.join(process.env.HOME, ".openclaw/yax-token.json");
const SYNC_STATE_DIR = path.join(process.env.HOME, ".openclaw/yax-sync");

// Per-file upload cap: 1 GB on a free account, 50 GB with Yandex 360.
const MAX_FILE_BYTES = 50 * 1024 ** 3;
// Never worth syncing: rebuilt by a package manager or a build, not by you.
const SYNC_SKIP = [
  "node_modules", ".venv", "venv", "__pycache__", ".git",
  ".next", ".cache", ".pytest_cache", ".DS_Store", "*.pyc",
];

// Timezone offset lookup (standard offsets, no DST)
const TIMEZONE_OFFSETS = {
  'Europe/Moscow': '+0300',
  'Europe/Paris': '+0100',
  'Europe/Berlin': '+0100',
  'Europe/London': '+0000',
  'America/New_York': '-0500',
  'America/Chicago': '-0600',
  'America/Denver': '-0700',
  'America/Los_Angeles': '-0800',
  'Asia/Tokyo': '+0900',
  'Asia/Shanghai': '+0800',
  'Asia/Kolkata': '+0530',
  'Asia/Dubai': '+0400',
  'Asia/Novosibirsk': '+0700',
  'Asia/Yekaterinburg': '+0500',
  'UTC': '+0000',
};

function getTzOffset(tz) {
  const offset = TIMEZONE_OFFSETS[tz];
  if (!offset) {
    console.warn(`⚠️  Unknown timezone: ${tz}, defaulting to Europe/Moscow (+0300)`);
    return '+0300';
  }
  return offset;
}
const CONFIG_FILE = path.join(process.env.HOME, ".openclaw/yax.env");

// --- Env loading ---
function loadEnv() {
  const env = {};
  if (fs.existsSync(CONFIG_FILE)) {
    for (const line of fs.readFileSync(CONFIG_FILE, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

// --- Token management ---
function loadToken() {
  if (fs.existsSync(TOKEN_FILE)) return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  return null;
}
function saveToken(data) {
  data.issued_at = Math.floor(Date.now() / 1000);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// --- HTTP helpers ---
function request(options, body) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === "http:" ? http : https;
    delete options.protocol;
    const req = mod.request(options, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function apiRequest(method, hostname, path, token, body, extraHeaders = {}) {
  const headers = { Authorization: `OAuth ${token}`, ...extraHeaders };
  if (body && typeof body === "string") {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body);
  }
  return request({ hostname, path, method, headers }, body || undefined);
}

// --- Auth ---
async function auth() {
  const env = loadEnv();
  const clientId = env.YAX_CLIENT_ID;
  if (!clientId) {
    console.error("Set YAX_CLIENT_ID in ~/.openclaw/yax.env");
    process.exit(1);
  }
  const clientSecret = env.YAX_CLIENT_SECRET || "";
  const mode = process.argv[3] || "device"; // 'device' or 'code'

  if (mode === "device") {
    // Device code flow (no browser needed on this machine)
    const dcBody = `client_id=${clientId}`;
    const dcRes = await request(
      {
        hostname: "oauth.yandex.ru",
        path: "/device/code",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(dcBody),
        },
      },
      dcBody,
    );
    const dc = JSON.parse(dcRes.body.toString());
    if (!dc.device_code) {
      console.error("Device code error:", dc);
      return;
    }

    console.log(`\nGo to: ${dc.verification_url}`);
    console.log(`Enter code: ${dc.user_code}\n`);
    console.log(`Waiting for authorization (${dc.expires_in}s)...`);

    const interval = (dc.interval || 5) * 1000;
    const deadline = Date.now() + dc.expires_in * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      let tokenBody = `grant_type=device_code&code=${dc.device_code}&client_id=${clientId}`;
      if (clientSecret) tokenBody += `&client_secret=${clientSecret}`;
      const tRes = await request(
        {
          hostname: "oauth.yandex.ru",
          path: "/token",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(tokenBody),
          },
        },
        tokenBody,
      );
      const tData = JSON.parse(tRes.body.toString());
      if (tData.access_token) {
        saveToken(tData);
        console.log("Authenticated successfully! Token saved.");
        return;
      }
      if (tData.error !== "authorization_pending") {
        console.error("Auth error:", tData);
        return;
      }
    }
    console.error("Authorization timed out");
  } else {
    // Manual code flow
    console.log(`Open this URL in your browser:\n`);
    console.log(
      `https://oauth.yandex.ru/authorize?response_type=code&client_id=${clientId}&redirect_uri=https://oauth.yandex.ru/verification_code\n`,
    );

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise((r) => rl.question("Enter the verification code: ", r));
    rl.close();

    let postBody = `grant_type=authorization_code&code=${code}&client_id=${clientId}`;
    if (clientSecret) postBody += `&client_secret=${clientSecret}`;

    const res = await request(
      {
        hostname: "oauth.yandex.ru",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postBody),
        },
      },
      postBody,
    );

    const data = JSON.parse(res.body.toString());
    if (data.access_token) {
      saveToken(data);
      console.log("Authenticated successfully! Token saved.");
    } else {
      console.error("Auth failed:", data);
    }
  }
}

function getToken() {
  const t = loadToken();
  if (!t || !t.access_token) {
    console.error("Not authenticated. Run: yax auth");
    process.exit(1);
  }

  // Check if token expired
  const now = Math.floor(Date.now() / 1000);
  const issued = t.issued_at || 0;
  const expiresIn = t.expires_in || 31536000; // Default 1 year
  const expiresAt = issued + expiresIn;

  if (issued > 0 && now >= expiresAt) {
    console.error("Token expired. Run: yax auth");
    process.exit(1);
  }

  // Warn if expiring soon (< 7 days)
  if (issued > 0) {
    const daysLeft = Math.floor((expiresAt - now) / 86400);
    if (daysLeft < 7) {
      console.warn(`⚠️  Token expires in ${daysLeft} days. Consider refreshing: yax auth`);
    }
  }

  return t.access_token;
}

// --- Disk ---
async function diskInfo() {
  const token = getToken();
  const res = await apiRequest("GET", "cloud-api.yandex.net", "/v1/disk/", token);
  console.log(JSON.parse(res.body.toString()));
}

async function diskList(p = "/") {
  const token = getToken();
  const res = await apiRequest(
    "GET",
    "cloud-api.yandex.net",
    `/v1/disk/resources?path=${encodeURIComponent(p)}&limit=50`,
    token,
  );
  const data = JSON.parse(res.body.toString());
  if (data._embedded?.items) {
    for (const item of data._embedded.items) {
      const type = item.type === "dir" ? "📁" : "📄";
      console.log(`${type} ${item.name} ${item.size ? `(${item.size} bytes)` : ""}`);
    }
  } else {
    console.log(data);
  }
}

async function diskMkdir(p) {
  const token = getToken();
  const res = await apiRequest(
    "PUT",
    "cloud-api.yandex.net",
    `/v1/disk/resources?path=${encodeURIComponent(p)}`,
    token,
  );
  console.log(res.status === 201 ? `Created: ${p}` : JSON.parse(res.body.toString()));
}

// Streams the body instead of buffering it: a 1.3 GB file must not become a
// 1.3 GB Buffer just to be PUT.
function putStream(href, localPath, size, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(href);
    const mod = url.protocol === "http:" ? http : https;
    const req = mod.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "PUT",
        headers: { Authorization: `OAuth ${token}`, "Content-Length": size },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on("error", reject);
    const stream = fs.createReadStream(localPath);
    stream.on("error", (err) => {
      req.destroy();
      reject(err);
    });
    stream.pipe(req);
  });
}

async function uploadOne(localPath, remotePath, token) {
  const size = fs.statSync(localPath).size;
  if (size > MAX_FILE_BYTES) {
    throw new Error(
      `${formatBytes(size)} exceeds the ${formatBytes(MAX_FILE_BYTES)} per-file limit`,
    );
  }
  const res = await apiRequest(
    "GET",
    "cloud-api.yandex.net",
    `/v1/disk/resources/upload?path=${encodeURIComponent(remotePath)}&overwrite=true`,
    token,
  );
  const data = JSON.parse(res.body.toString());
  if (!data.href) {
    const hint =
      data.error === "ForbiddenError"
        ? " — the OAuth app is missing scope cloud_api:disk.write; add it and re-run `yax auth`"
        : "";
    throw new Error(`upload URL: ${JSON.stringify(data)}${hint}`);
  }
  const uploadRes = await putStream(data.href, localPath, size, token);
  if (uploadRes.status !== 201 && uploadRes.status !== 202) {
    throw new Error(
      `PUT ${remotePath}: HTTP ${uploadRes.status} ${uploadRes.body.toString().slice(0, 200)}`,
    );
  }
  return size;
}

async function diskUpload(localPath, remotePath) {
  const token = getToken();
  await uploadOne(localPath, remotePath, token);
  console.log(`Uploaded: ${remotePath}`);
}

async function diskDownload(remotePath, localPath) {
  const token = getToken();
  const res = await apiRequest(
    "GET",
    "cloud-api.yandex.net",
    `/v1/disk/resources/download?path=${encodeURIComponent(remotePath)}`,
    token,
  );
  const data = JSON.parse(res.body.toString());
  if (!data.href) {
    console.error("Download URL error:", data);
    return;
  }

  const url = new URL(data.href);
  const dlRes = await request({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: "GET",
    headers: { Authorization: `OAuth ${token}` },
  });

  if (dlRes.status >= 300 && dlRes.status < 400 && dlRes.headers.location) {
    const rUrl = new URL(dlRes.headers.location);
    const rRes = await request({
      hostname: rUrl.hostname,
      path: rUrl.pathname + rUrl.search,
      method: "GET",
    });
    fs.writeFileSync(localPath, rRes.body);
  } else {
    fs.writeFileSync(localPath, dlRes.body);
  }
  console.log(`Downloaded to: ${localPath}`);
}

// --- Disk sync ---
function formatBytes(n) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)}${units[i]}`;
}

function fileMd5(p) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(p);
    stream.on("error", reject);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Retries only what is worth retrying: a 4xx will not fix itself.
async function withRetries(fn, what, attempts = 5) {
  let delay = 2000;
  for (let i = 1; ; i += 1) {
    try {
      return await fn();
    } catch (e) {
      const status = e.status || 0;
      const retryable = status >= 500 || status === 429 || status === 0;
      if (!retryable || i >= attempts) throw e;
      console.log(`    retry ${i}/${attempts - 1} — ${what}: ${e.message}`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

async function diskStat(remotePath, token) {
  const res = await apiRequest(
    "GET",
    "cloud-api.yandex.net",
    `/v1/disk/resources?path=${encodeURIComponent(remotePath)}&fields=md5,size,type`,
    token,
  );
  if (res.status === 404) return null;
  if (res.status !== 200) {
    const err = new Error(`stat ${remotePath}: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(res.body.toString());
}

async function ensureRemoteDir(remotePath, token, made) {
  if (!remotePath || remotePath === "/" || made.has(remotePath)) return;
  const parent = path.posix.dirname(remotePath);
  if (parent && parent !== "/" && parent !== remotePath) {
    await ensureRemoteDir(parent, token, made);
  }
  const res = await apiRequest(
    "PUT",
    "cloud-api.yandex.net",
    `/v1/disk/resources?path=${encodeURIComponent(remotePath)}`,
    token,
  );
  // 409 is the documented "already exists", which is success for our purposes.
  if (res.status !== 201 && res.status !== 409) {
    const err = new Error(`mkdir ${remotePath}: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  made.add(remotePath);
}

function skipName(name, extra) {
  return [...SYNC_SKIP, ...extra].some((pattern) =>
    pattern.includes("*")
      ? new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(name)
      : name === pattern,
  );
}

function walkTree(root, extra) {
  const out = [];
  const visit = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (skipName(entry.name, extra)) continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue; // a symlink's target is synced on its own
      if (entry.isDirectory()) visit(full, relPath);
      else if (entry.isFile()) out.push({ full, rel: relPath, size: fs.statSync(full).size });
    }
  };
  visit(root, "");
  return out;
}

function syncStatePath(remoteRoot) {
  const key = crypto.createHash("sha1").update(remoteRoot).digest("hex").slice(0, 16);
  return path.join(SYNC_STATE_DIR, `${key}.json`);
}

async function diskSync(localDir, remoteDir, opts = {}) {
  const token = getToken();
  const root = path.resolve(localDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`not a directory: ${root}`);
  }
  const remoteRoot = `/${remoteDir.replace(/^\/+|\/+$/g, "")}`;

  const infoRes = await apiRequest("GET", "cloud-api.yandex.net", "/v1/disk/", token);
  const info = JSON.parse(infoRes.body.toString());
  const free = info.total_space - info.used_space;

  const files = walkTree(root, opts.exclude || []);
  const oversized = files.filter((f) => f.size > MAX_FILE_BYTES);
  const todo = files.filter((f) => f.size <= MAX_FILE_BYTES);
  const total = todo.reduce((s, f) => s + f.size, 0);

  console.log(`Disk: ${formatBytes(free)} free of ${formatBytes(info.total_space)}`);
  console.log(`${todo.length} files, ${formatBytes(total)} → ${remoteRoot}`);
  for (const f of oversized) {
    console.log(`  SKIP (over ${formatBytes(MAX_FILE_BYTES)}): ${f.rel} (${formatBytes(f.size)})`);
  }
  if (total > free) throw new Error(`need ${formatBytes(total)}, only ${formatBytes(free)} free`);
  if (opts.dryRun) {
    for (const f of todo) console.log(`  would upload ${formatBytes(f.size).padStart(9)}  ${f.rel}`);
    return oversized.length === 0;
  }

  fs.mkdirSync(SYNC_STATE_DIR, { recursive: true });
  const statePath = syncStatePath(remoteRoot);
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      state = {};
    }
  }
  const saveState = () =>
    fs.writeFileSync(statePath, JSON.stringify(state, null, 0), { mode: 0o600 });

  const made = new Set();
  await ensureRemoteDir(remoteRoot, token, made);

  const failed = [];
  let doneBytes = 0;
  let cursor = 0;
  let sinceSave = 0;

  // Yandex throttles per connection, not per account: measured 0.25 MB/s on one
  // stream and 0.505 MB/s on two (2.02x, near-linear). One stream therefore
  // leaves most of the link idle, so uploads run through a small worker pool.
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= todo.length) return;
      const f = todo[i];
      const remotePath = `${remoteRoot}/${f.rel}`;
      const tag = `[${i + 1}/${todo.length}]`;
      try {
        const md5 = await fileMd5(f.full);
        if (state[remotePath] === md5) {
          doneBytes += f.size;
          console.log(`${tag} skip ${f.rel}`);
          continue;
        }
        const existing = await withRetries(() => diskStat(remotePath, token), `stat ${f.rel}`);
        if (existing && existing.md5 === md5) {
          state[remotePath] = md5;
          doneBytes += f.size;
          console.log(`${tag} skip (verified) ${f.rel}`);
          continue;
        }
        await ensureRemoteDir(path.posix.dirname(remotePath), token, made);
        console.log(`${tag} ${formatBytes(f.size).padStart(9)}  ${f.rel}`);
        await withRetries(() => uploadOne(f.full, remotePath, token), `upload ${f.rel}`);

        // Verify against what the server actually stored, not against a 201.
        const check = await withRetries(() => diskStat(remotePath, token), `verify ${f.rel}`);
        if (!check || check.md5 !== md5) {
          failed.push([f.rel, `MD5 mismatch (server: ${check && check.md5})`]);
          console.log(`${tag}   MD5 MISMATCH ${f.rel}`);
          continue;
        }
        state[remotePath] = md5;
        doneBytes += f.size;
      } catch (e) {
        failed.push([f.rel, e.message]);
        console.log(`${tag}   FAILED ${f.rel}: ${e.message}`);
      } finally {
        // In a finally, so the `continue`s above still checkpoint progress.
        sinceSave += 1;
        if (sinceSave % 20 === 0) saveState();
      }
    }
  };

  const jobs = Math.max(1, Math.min(opts.jobs || 1, todo.length || 1));
  if (jobs > 1) console.log(`${jobs} parallel workers`);
  await Promise.all(Array.from({ length: jobs }, () => worker()));
  saveState();

  console.log(`\nVerified ${formatBytes(doneBytes)} of ${formatBytes(total)}`);
  for (const [rel, why] of failed) console.log(`  FAILED ${rel}: ${why}`);
  const ok = failed.length === 0 && oversized.length === 0;
  console.log(ok ? "ALL VERIFIED" : `INCOMPLETE — ${failed.length + oversized.length} unresolved`);
  return ok;
}

// --- Calendar (CalDAV) ---
// Get user login from Yandex OAuth API
async function getUserLogin() {
  const token = getToken();
  const res = await request({
    hostname: "login.yandex.ru",
    path: "/info",
    method: "GET",
    headers: { Authorization: `OAuth ${token}` },
  });
  const data = JSON.parse(res.body.toString());
  return data.login;
}

// Discover calendars for the user (raw PROPFIND multistatus XML)
async function discoverCalendars(login) {
  const token = getToken();
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;
  const res = await request(
    {
      hostname: "caldav.yandex.ru",
      path: calendarPath(login),
      method: "PROPFIND",
      headers: {
        Authorization: `OAuth ${token}`,
        "Content-Type": "application/xml",
        Depth: "1",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body,
  );
  return res.body.toString();
}

// Build a CalDAV path. Every segment is URL-encoded so UIDs containing
// spaces, '#', '?' or non-ASCII characters are addressed correctly.
function calendarPath(login, calendarId, uid) {
  let p = `/calendars/${encodeURIComponent(login + "@yandex.ru")}/`;
  if (calendarId) p += `${encodeURIComponent(calendarId)}/`;
  if (uid) p += encodeURIComponent(uid + ".ics");
  return p;
}

// All `events-N` calendar ids for the user, in discovery order.
async function findEventsCalendars(login) {
  const xml = await discoverCalendars(login);
  const ids = [...xml.matchAll(/\/calendars\/[^\/]+\/(events-\d+)\//g)].map((m) => m[1]);
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    console.error("No events calendar found");
    process.exitCode = 1;
  }
  return unique;
}

function caldavRequest(method, path, token, body, extraHeaders = {}) {
  const headers = { Authorization: `OAuth ${token}`, ...extraHeaders };
  if (body) headers["Content-Length"] = Buffer.byteLength(body);
  return request({ hostname: "caldav.yandex.ru", path, method, headers }, body);
}

// --- iCalendar helpers ---

// Unfold RFC 5545 content lines; accepts CRLF or bare LF input.
function icsLines(body) {
  const lines = [];
  for (const raw of body.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += raw.slice(1);
    } else if (raw.length) {
      lines.push(raw);
    }
  }
  return lines;
}

// "DTSTART;TZID=Europe/Moscow:20260214T110000" -> { name, params, value }
function icsProp(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/); // first ':' outside quotes
  if (colon < 0) return null;
  const [name, ...params] = line.slice(0, colon).split(";");
  return { name: name.toUpperCase(), params: params.join(";"), value: line.slice(colon + 1) };
}

function icsUnescape(text) {
  return text.replace(/\\([\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Format a DATE / DATE-TIME value for display. Handles TZID, UTC ("Z") and all-day values.
function formatIcsDate(prop) {
  if (!prop) return "";
  const v = prop.value.trim();
  const d = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (v.length === 8) return `${d} (all day)`;
  const t = `${v.slice(9, 11)}:${v.slice(11, 13)}`;
  return v.endsWith("Z") ? `${d} ${t}Z` : `${d} ${t}`;
}

// Properties of the master VEVENT (the one without RECURRENCE-ID), as a map of name -> prop.
function icsMasterEvent(body) {
  const lines = icsLines(body);
  let inEvent = false;
  let props = {};
  for (const line of lines) {
    const p = icsProp(line);
    if (!p) continue;
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
      inEvent = true;
      props = {};
    } else if (p.name === "END" && p.value.toUpperCase() === "VEVENT") {
      inEvent = false;
      if (!props["RECURRENCE-ID"]) return props;
    } else if (inEvent && !props[p.name]) {
      props[p.name] = p;
    }
  }
  return null;
}

function icsTimezoneBlock(timezone) {
  const tzOffset = getTzOffset(timezone);
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${timezone}`,
    "BEGIN:STANDARD",
    "DTSTART:20260101T000000",
    `TZOFFSETFROM:${tzOffset}`,
    `TZOFFSETTO:${tzOffset}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

function icsStamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsDateTime(date, time) {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "")}`;
}

// Build a complete VCALENDAR with a single VEVENT.
function buildIcs({ uid, summary, date, startTime, endTime, description, timezone }) {
  const start = icsDateTime(date, startTime);
  const end = icsDateTime(date, endTime || startTime);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//yax//openclaw//EN",
    "CALSCALE:GREGORIAN",
    ...icsTimezoneBlock(timezone),
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStamp()}`,
    `DTSTART;TZID=${timezone}:${start}`,
    `DTEND;TZID=${timezone}:${end}`,
    `SUMMARY:${icsEscape(summary)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

// Rewrite only the master VEVENT of an existing calendar object: replace the
// date/time, summary (and description if given), bump SEQUENCE, refresh
// DTSTAMP/LAST-MODIFIED, and keep every other property (RRULE, ATTENDEE,
// ORGANIZER, VALARM, LOCATION, ...) and every other component untouched.
function updateIcs(body, { summary, date, startTime, endTime, description, timezone }) {
  const lines = icsLines(body);
  const out = [];
  let inEvent = false;
  let isMaster = false;
  let done = false;
  let hasTz = false;
  let seq = 0;
  const drop = new Set(["DTSTART", "DTEND", "DURATION", "SUMMARY", "SEQUENCE", "DTSTAMP", "LAST-MODIFIED"]);
  if (description !== undefined) drop.add("DESCRIPTION");

  // Determine whether the first VEVENT without RECURRENCE-ID exists and whether the TZ is defined.
  let eventIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const p = icsProp(lines[i]);
    if (!p) continue;
    if (p.name === "TZID" && p.value.trim() === timezone) hasTz = true;
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT" && eventIdx < 0) {
      let j = i + 1;
      let recurrence = false;
      for (; j < lines.length; j++) {
        const q = icsProp(lines[j]);
        if (!q) continue;
        if (q.name === "END" && q.value.toUpperCase() === "VEVENT") break;
        if (q.name === "RECURRENCE-ID") recurrence = true;
        if (q.name === "SEQUENCE") seq = parseInt(q.value, 10) || 0;
      }
      if (!recurrence) eventIdx = i;
    }
  }
  if (eventIdx < 0) return null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const p = icsProp(line);
    if (p && p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
      if (i === eventIdx) {
        inEvent = true;
        isMaster = true;
        if (!hasTz) out.push(...icsTimezoneBlock(timezone));
      }
      out.push(line);
      continue;
    }
    if (p && p.name === "END" && p.value.toUpperCase() === "VEVENT" && inEvent) {
      if (isMaster && !done) {
        out.push(
          `DTSTAMP:${icsStamp()}`,
          `LAST-MODIFIED:${icsStamp()}`,
          `SEQUENCE:${seq + 1}`,
          `DTSTART;TZID=${timezone}:${icsDateTime(date, startTime)}`,
          `DTEND;TZID=${timezone}:${icsDateTime(date, endTime || startTime)}`,
          `SUMMARY:${icsEscape(summary)}`,
        );
        if (description) out.push(`DESCRIPTION:${icsEscape(description)}`);
        done = true;
      }
      inEvent = false;
      isMaster = false;
      out.push(line);
      continue;
    }
    if (inEvent && isMaster && p && drop.has(p.name)) continue;
    out.push(line);
  }
  return out.join("\r\n") + "\r\n";
}

// Locate the calendar that holds `uid`. Returns { calendarId, etag, body } or null.
async function findEvent(login, uid) {
  const token = getToken();
  for (const calendarId of await findEventsCalendars(login)) {
    const res = await caldavRequest("GET", calendarPath(login, calendarId, uid), token);
    if (res.status === 200) {
      return { calendarId, etag: res.headers.etag, body: res.body.toString() };
    }
    if (res.status !== 404) {
      console.error(`❌ GET ${calendarId}/${uid}.ics: status ${res.status}`);
    }
  }
  return null;
}

function xmlUnescape(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

async function calendarList() {
  const login = await getUserLogin();
  const xml = await discoverCalendars(login);

  // Parse calendar entries (exclude inbox/outbox)
  const calendarRegex =
    /<href[^>]*>\/calendars\/[^\/]+\/(events-\d+|todos-\d+)\/[^<]*<\/href>\s*<D:propstat>.*?<D:displayname>([^<]+)<\/D:displayname>.*?<C:calendar/gis;
  const matches = [...xml.matchAll(calendarRegex)];

  if (matches.length) {
    matches.forEach((m) => {
      const calId = m[1];
      const name = m[2];
      console.log(`📅 ${name} (${calId})`);
    });
  } else {
    console.log("No calendars found");
  }
}

async function calendarCreate(
  summary,
  date,
  startTime,
  endTime,
  description,
  timezone = "Europe/Moscow",
) {
  const login = await getUserLogin();
  const [calendarId] = await findEventsCalendars(login);
  if (!calendarId) return;

  const token = getToken();
  const uid = `yax-${Date.now()}@openclaw`;
  const ics = buildIcs({ uid, summary, date, startTime, endTime, description, timezone });

  const res = await caldavRequest("PUT", calendarPath(login, calendarId, uid), token, ics, {
    "Content-Type": "text/calendar; charset=utf-8",
    "If-None-Match": "*",
  });

  if (res.status === 201) {
    console.log(`✅ Created event: ${summary} at ${startTime} (UID: ${uid})`);
  } else {
    console.log(`❌ Status: ${res.status}`);
    console.log(res.body.toString().substring(0, 500));
    process.exitCode = 1;
  }
}

// Fetch all events of one calendar in a single REPORT (calendar-query with calendar-data).
// Returns an array of ICS bodies, or null if the server does not support the REPORT.
async function reportCalendarEvents(login, calendarId, token) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const res = await caldavRequest("REPORT", calendarPath(login, calendarId), token, body, {
    "Content-Type": "application/xml; charset=utf-8",
    Depth: "1",
  });
  if (res.status !== 207) return null;
  const xml = res.body.toString();
  const dataRegex = /<(?:[\w-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/gi;
  return [...xml.matchAll(dataRegex)].map((m) => xmlUnescape(m[1]));
}

// Fallback for servers without calendar-query: PROPFIND hrefs, then GET each object.
async function fetchCalendarEventsIndividually(login, calendarId, token) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`;
  const res = await caldavRequest("PROPFIND", calendarPath(login, calendarId), token, body, {
    "Content-Type": "application/xml",
    Depth: "1",
  });
  const hrefs = [...res.body.toString().matchAll(/<(?:[\w-]+:)?href[^>]*>([^<]+\.ics)<\/(?:[\w-]+:)?href>/gi)];
  const bodies = [];
  for (const m of hrefs) {
    let href = xmlUnescape(m[1]);
    if (/^https?:\/\//i.test(href)) {
      const u = new URL(href);
      href = u.pathname + u.search;
    }
    const icsRes = await caldavRequest("GET", href, token);
    if (icsRes.status === 200) bodies.push(icsRes.body.toString());
  }
  return bodies;
}

// List events in every events calendar
async function calendarListEvents() {
  const login = await getUserLogin();
  const token = getToken();
  const calendars = await findEventsCalendars(login);
  let total = 0;

  for (const calendarId of calendars) {
    let bodies = await reportCalendarEvents(login, calendarId, token);
    if (bodies === null) bodies = await fetchCalendarEventsIndividually(login, calendarId, token);

    const rows = [];
    for (const body of bodies) {
      const ev = icsMasterEvent(body);
      if (!ev || !ev.UID) continue;
      const summary = ev.SUMMARY ? icsUnescape(ev.SUMMARY.value).trim() : "(no title)";
      const recurring = ev.RRULE ? " 🔁" : "";
      rows.push({ date: formatIcsDate(ev.DTSTART), text: `${summary}${recurring} | UID: ${ev.UID.value.trim()}` });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (calendars.length > 1) console.log(`📅 ${calendarId}`);
    for (const r of rows) console.log(`${r.date} | ${r.text}`);
    total += rows.length;
  }
  if (total === 0 && calendars.length) console.log("No events found");
}

// Update an existing event by UID, preserving all properties we do not manage.
async function calendarUpdate(uid, newSummary, newDate, newStartTime, newEndTime, newDescription, timezone = "Europe/Moscow") {
  const login = await getUserLogin();
  const token = getToken();
  const found = await findEvent(login, uid);
  if (!found) {
    console.error(`Event not found: ${uid}`);
    process.exitCode = 1;
    return;
  }

  const ics = updateIcs(found.body, {
    summary: newSummary,
    date: newDate,
    startTime: newStartTime,
    endTime: newEndTime,
    description: newDescription,
    timezone,
  });
  if (!ics) {
    console.error(`❌ No VEVENT found in ${uid}.ics`);
    process.exitCode = 1;
    return;
  }

  const headers = { "Content-Type": "text/calendar; charset=utf-8" };
  if (found.etag) headers["If-Match"] = found.etag;
  const putRes = await caldavRequest("PUT", calendarPath(login, found.calendarId, uid), token, ics, headers);

  if (putRes.status === 200 || putRes.status === 201 || putRes.status === 204) {
    console.log(`✅ Updated event: ${newSummary}`);
  } else if (putRes.status === 412) {
    console.error("❌ Event was modified by another client meanwhile. Re-run the update.");
    process.exitCode = 1;
  } else {
    console.log(`❌ Status: ${putRes.status}`);
    console.log(putRes.body.toString().substring(0, 500));
    process.exitCode = 1;
  }
}

// Delete an event by UID
async function calendarDelete(uid) {
  const login = await getUserLogin();
  const token = getToken();
  const found = await findEvent(login, uid);
  if (!found) {
    console.error(`Event not found: ${uid}`);
    process.exitCode = 1;
    return;
  }

  const headers = {};
  if (found.etag) headers["If-Match"] = found.etag;
  const res = await caldavRequest("DELETE", calendarPath(login, found.calendarId, uid), token, undefined, headers);

  if (res.status === 200 || res.status === 204) {
    console.log(`✅ Deleted event: ${uid}`);
  } else if (res.status === 404) {
    console.error(`Event not found: ${uid}`);
    process.exitCode = 1;
  } else {
    console.log(`❌ Status: ${res.status}`);
    process.exitCode = 1;
  }
}

// --- Mail ---
// Yandex has no public HTTP API for mail, so IMAP/SMTP are handled by mail.py
// (Python 3 stdlib). The child's exit code is propagated so callers can rely on it.
function mailMain() {
  const { spawn } = require("child_process");
  const script = path.join(__dirname, "mail.py");
  const args = process.argv.slice(3); // yax mail <subcommand> <args>
  return new Promise((resolve) => {
    const child = spawn("python3", [script, ...args], { stdio: "inherit" });
    child.on("error", (e) => {
      console.error("Mail error:", e.message);
      if (e.code === "ENOENT") console.error("python3 is required for `yax mail` commands. Install Python 3 and retry.");
      process.exitCode = 1;
      resolve();
    });
    child.on("close", (code, signal) => {
      process.exitCode = code === 0 ? 0 : code > 0 ? code : 1;
      if (signal) console.error(`mail.py terminated by ${signal}`);
      resolve();
    });
  });
}

// --- CLI ---
async function main() {
  const [, , cmd, sub, ...args] = process.argv;

  try {
    switch (cmd) {
      case "auth":
        return auth();
      case "disk":
        switch (sub) {
          case "info":
            return diskInfo();
          case "list":
          case "ls":
            return diskList(args[0] || "/");
          case "mkdir":
            if (!args[0]) {
              console.error("Usage: yax disk mkdir <path>");
              process.exit(1);
            }
            return diskMkdir(args[0]);
          case "upload":
            if (!args[0] || !args[1]) {
              console.error("Usage: yax disk upload <local-file> <remote-path>");
              process.exit(1);
            }
            return diskUpload(args[0], args[1]);
          case "download":
            if (!args[0] || !args[1]) {
              console.error("Usage: yax disk download <remote-path> <local-file>");
              process.exit(1);
            }
            return diskDownload(args[0], args[1]);
          case "sync": {
            const positional = args.filter(
              (a, idx) => !a.startsWith("--") && args[idx - 1] !== "--exclude" && args[idx - 1] !== "--jobs",
            );
            if (positional.length < 2) {
              console.error(
                "Usage: yax disk sync <local-dir> <remote-dir> [--jobs N] [--dry-run] [--exclude NAME]...",
              );
              process.exitCode = 1;
              return;
            }
            const exclude = [];
            for (let i = 0; i < args.length; i += 1) {
              if (args[i] === "--exclude" && args[i + 1]) exclude.push(args[i + 1]);
            }
            let jobs = 1;
            for (let i = 0; i < args.length; i += 1) {
              if (args[i] === "--jobs" && args[i + 1]) jobs = parseInt(args[i + 1], 10) || 1;
              const inline = /^--jobs=(\d+)$/.exec(args[i]);
              if (inline) jobs = parseInt(inline[1], 10) || 1;
            }
            const ok = await diskSync(positional[0], positional[1], {
              dryRun: args.includes("--dry-run"),
              exclude,
              jobs,
            });
            if (!ok) process.exitCode = 1;
            return;
          }
          default:
            console.log("Usage: yax disk [info|list|mkdir|upload|download|sync]");
        }
        break;
      case "calendar":
      case "cal":
        switch (sub) {
          case "list":
            return calendarList();
          case "list-events":
            return calendarListEvents();
          case "create": {
            // calendar create "Summary" "2026-02-14" "11:00:00" "12:00:00" "Description" "Europe/Moscow"
            const [summary, date, startTime, endTime, description, timezone] = args;
            if (!summary || !date || !startTime) {
              console.log(
                "Usage: yax calendar create <summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [description] [timezone]",
              );
              return;
            }
            return calendarCreate(summary, date, startTime, endTime, description, timezone);
          }
          case "update": {
            // calendar update <uid> <new-summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [description] [timezone]
            const [uid, newSummary, newDate, newStartTime, newEndTime, newDescription, timezone] = args;
            if (!uid || !newSummary || !newDate || !newStartTime) {
              console.log(
                "Usage: yax calendar update <uid> <new-summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [description] [timezone]",
              );
              return;
            }
            return calendarUpdate(uid, newSummary, newDate, newStartTime, newEndTime, newDescription, timezone);
          }
          case "delete": {
            // calendar delete <uid>
            if (!args[0]) {
              console.log("Usage: yax calendar delete <uid>");
              return;
            }
            return calendarDelete(args[0]);
          }
          default:
            console.log(
              "Usage: yax calendar [list|list-events|create|update|delete]",
            );
        }
        break;
      case "mail":
        return mailMain();
      default:
        console.log(`yax — Yandex 360 CLI

Commands:
  auth                    Authenticate with Yandex OAuth
  disk info               Disk info
  disk list [path]        List directory
  disk mkdir <path>       Create directory
  disk upload <local> <remote>   Upload file (streamed)
  disk download <remote> <local> Download file
  disk sync <local-dir> <remote-dir> [--jobs N] [--dry-run] [--exclude NAME]
                          Mirror a directory tree, MD5-verified and resumable.
                          --jobs runs N uploads at once (Yandex throttles per
                          connection, so N>1 is markedly faster)
  calendar list           List calendars
  calendar list-events    List events (date, title, UID) in all events calendars
  calendar create <summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [desc] [tz]  Create event
  calendar update <uid> <summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [desc] [tz]  Update event
  calendar delete <uid>   Delete event by UID
  mail folders             List all mail folders
  mail list [folder] [n]   List recent emails (default: INBOX, last 10)
  mail read <uid> [folder] Read email by UID
  mail delete <uid> [folder] Delete email by UID
  mail send <to> <subject> <body>  Send email via SMTP
  mail attachments <uid> [folder]  List attachments in email
  mail download <uid> <name> [folder] [dir]  Download one attachment
  mail download_all <uid> [folder] [dir]  Download all attachments (default dir: ./attachments)

Mail commands require python3 (stdlib only).`);
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { icsLines, icsProp, icsMasterEvent, formatIcsDate, buildIcs, updateIcs, calendarPath, xmlUnescape, formatBytes, skipName, walkTree, syncStatePath };
}
