// みらい取締役会・監査統合基盤 WebUI 配信サーバー
// 提示されたHTMLファイル（企画書・要件定義書・詳細仕様設計書・モックアップPart4）をそのまま配信する。
// 使用方法: HOST=0.0.0.0 PORT=8090 node scripts/webui-server.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WEBUI_DIR = join(ROOT, "webui");
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 8090);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function safeResolve(base, rel) {
  const target = normalize(join(base, rel));
  if (target !== base && !target.startsWith(base + "/") && !target.startsWith(base + "\\")) {
    return null;
  }
  return target;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  // index.html は廃止し、ルートURLのみとする
  if (pathname === "/index.html") {
    res.writeHead(301, { location: "/", "content-type": "text/plain; charset=utf-8" });
    res.end("301 Moved Permanently");
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
    res.end("405 Method Not Allowed");
    return;
  }

  let candidates = [];
  if (pathname === "/") {
    // ルート表示はモックアップ（拡張デモ）
    candidates = [join(WEBUI_DIR, "mockup.html")];
  } else if (pathname === "/mockup.html") {
    candidates = [join(WEBUI_DIR, "mockup.html")];
  } else {
    const rel = pathname.replace(/^\/+/, "");
    candidates = [safeResolve(WEBUI_DIR, rel), safeResolve(ROOT, rel)].filter(Boolean);
  }
  if (candidates.length === 0) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  let body = null;
  let filePath = null;
  for (const candidate of candidates) {
    try {
      body = await readFile(candidate);
      filePath = candidate;
      break;
    } catch {
      /* next candidate */
    }
  }
  if (filePath && body) {
    const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "content-length": body.length,
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    });
    res.end(method === "HEAD" ? undefined : body);
  } else {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mirai Board Audit Governance WebUI: http://${HOST}:${PORT}/`);
});
