#!/usr/bin/env node
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const TOKEN_FILE = path.join(process.env.HOME, ".openclaw/yax-token.json");
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
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
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

async function diskUpload(localPath, remotePath) {
  const token = getToken();
  const res = await apiRequest(
    "GET",
    "cloud-api.yandex.net",
    `/v1/disk/resources/upload?path=${encodeURIComponent(remotePath)}&overwrite=true`,
    token,
  );
  const data = JSON.parse(res.body.toString());
  if (!data.href) {
    console.error("Upload URL error:", data);
    return;
  }

  const url = new URL(data.href);
  const fileData = fs.readFileSync(localPath);
  const uploadRes = await request(
    {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "PUT",
      headers: {
        Authorization: `OAuth ${token}`,
        "Content-Length": fileData.length,
      },
    },
    fileData,
  );
  console.log(uploadRes.status === 201 ? `Uploaded: ${remotePath}` : `Status: ${uploadRes.status}`);
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

// Discover calendars for the user
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
      path: `/calendars/${login}@yandex.ru/`,
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
  const xml = await discoverCalendars(login);

  // Find first events calendar
  const match = xml.match(/\/calendars\/[^\/]+\/(events-\d+)\//);
  if (!match) {
    console.error("No events calendar found");
    return;
  }
  const calendarId = match[1];

  const token = getToken();
  const uid = `yax-${Date.now()}@openclaw`;

  // Parse time properly
  const start = startTime.replace(/:/g, "");
  const end = endTime ? endTime.replace(/:/g, "") : start;

  // Build ICS with timezone support
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//yax//openclaw//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    `TZID:${timezone}`,
    "BEGIN:STANDARD",
    "DTSTART:20260101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;TZID=${timezone}:${date.replace(/-/g, "")}T${start}`,
    `DTEND;TZID=${timezone}:${date.replace(/-/g, "")}T${end}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const path = `/calendars/${login}@yandex.ru/${calendarId}/${uid}.ics`;
  const res = await request(
    {
      hostname: "caldav.yandex.ru",
      path: path,
      method: "PUT",
      headers: {
        Authorization: `OAuth ${token}`,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Length": Buffer.byteLength(ics),
      },
    },
    ics,
  );

  if (res.status === 201) {
    console.log(`✅ Created event: ${summary} at ${startTime}`);
  } else {
    console.log(`❌ Status: ${res.status}`);
    console.log(res.body.toString().substring(0, 500));
  }
}

// --- Mail ---
// Yandex doesn't have a public HTTP API for mail (only IMAP/SMTP).
// We document this as a limitation. Below is a stub.
function mailNote() {
  console.log(`⚠️  Yandex Mail HTTP API is not publicly available.
Yandex only supports IMAP/SMTP for mail access.
Since SMTP/IMAP ports are often blocked in cloud environments,
mail functionality is currently unavailable.

Workaround: Use Yandex 360 Admin API if you have an organization account,
or use the Yandex Mail web interface.`);
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
            return diskMkdir(args[0]);
          case "upload":
            return diskUpload(args[0], args[1]);
          case "download":
            return diskDownload(args[0], args[1]);
          default:
            console.log("Usage: yax disk [info|list|mkdir|upload|download]");
        }
        break;
      case "calendar":
      case "cal":
        switch (sub) {
          case "list":
            return calendarList();
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
          default:
            console.log(
              "Usage: yax calendar [list|create <summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [description] [timezone]]",
            );
        }
        break;
      case "mail":
        return mailNote();
      default:
        console.log(`yax — Yandex 360 CLI

Commands:
  auth                    Authenticate with Yandex OAuth
  disk info               Disk info
  disk list [path]        List directory
  disk mkdir <path>       Create directory
  disk upload <local> <remote>   Upload file
  disk download <remote> <local> Download file
  calendar list           List calendars
  calendar create <summary> <YYYY-MM-DD> <HH:MM:SS> [HH:MM:SS] [desc] [tz]  Create event
  mail                    Mail info (limited)`);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
