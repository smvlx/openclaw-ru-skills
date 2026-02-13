#!/usr/bin/env node
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// Load env
const envFile =
  process.env.YANDEXGPT_ENV_FILE || path.join(process.env.HOME, ".openclaw/yandexgpt.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const API_KEY = process.env.YANDEX_API_KEY;
const FOLDER_ID = process.env.YANDEX_FOLDER_ID;
const PORT = parseInt(process.env.YANDEX_PROXY_PORT || "8444");

if (!API_KEY || !FOLDER_ID) {
  console.error("Missing YANDEX_API_KEY or YANDEX_FOLDER_ID");
  process.exit(1);
}

const MODELS = {
  yandexgpt: "yandexgpt",
  "yandexgpt-lite": "yandexgpt-lite",
  "yandexgpt-32k": "yandexgpt-32k",
};

function modelUri(model) {
  const name = MODELS[model] || model;
  return `gpt://${FOLDER_ID}/${name}/latest`;
}

function translateRequest(openaiBody) {
  const model = openaiBody.model || "yandexgpt-lite";
  const messages = (openaiBody.messages || []).map((m) => ({
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    text: m.content || "",
  }));
  return {
    modelUri: modelUri(model),
    completionOptions: {
      stream: false,
      temperature: openaiBody.temperature ?? 0.6,
      maxTokens: openaiBody.max_tokens ?? 2000,
    },
    messages,
  };
}

function translateResponse(ycResp, model) {
  const alt = ycResp.result?.alternatives?.[0];
  return {
    id: "chatcmpl-yandex-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: alt?.message?.text || "" },
        finish_reason: alt?.status === "ALTERNATIVE_STATUS_FINAL" ? "stop" : "stop",
      },
    ],
    usage: {
      prompt_tokens: parseInt(ycResp.result?.usage?.inputTextTokens || "0"),
      completion_tokens: parseInt(ycResp.result?.usage?.completionTokens || "0"),
      total_tokens: parseInt(ycResp.result?.usage?.totalTokens || "0"),
    },
  };
}

function ycRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "llm.api.cloud.yandex.net",
        path: "/foundationModels/v1/completion",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${API_KEY}`,
          "x-folder-id": FOLDER_ID,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url;

  if (url === "/v1/models" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: Object.keys(MODELS).map((id) => ({ id, object: "model", owned_by: "yandex" })),
      }),
    );
    return;
  }

  if (url === "/v1/chat/completions" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const ycBody = translateRequest(body);
      const ycResp = await ycRequest(ycBody);
      if (ycResp.error) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: ycResp.error }));
        return;
      }
      const openaiResp = translateResponse(ycResp, body.model || "yandexgpt-lite");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(openaiResp));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`YandexGPT proxy listening on http://127.0.0.1:${PORT}`);
});
