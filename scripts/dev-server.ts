import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { serve } from "@hono/node-server";
import { buildApp } from "../src/app.ts";
import { SqliteDb } from "../src/db/sqlite.ts";
import { applyMigrations } from "../src/migrate.ts";

const cwd = process.cwd();
const vars = existsSync(join(cwd, ".dev.vars")) ? readFileSync(join(cwd, ".dev.vars"), "utf8") : "";
const getVar = (key: string, fallback = "") => vars.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1] ?? fallback;

const db = new SqliteDb(join(cwd, ".wrangler/dev.sqlite"));
await applyMigrations(db, join(cwd, "migrations"));
const app = buildApp({
  db,
  sessionSecret: getVar("SESSION_SECRET", "local-dev-secret"),
  seedKey: getVar("SEED_KEY", "local-dev-seed-key"),
  environment: "local",
  assetRoot: join(cwd, "web/dist"),
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

app.get("*", (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/")) return c.notFound();
  const root = join(cwd, "web/dist");
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  let file = join(root, rel);
  if (!file.startsWith(root)) return c.text("Forbidden", 403);
  if (!existsSync(file) || !file.includes(".")) file = join(root, "index.html");
  const body = readFileSync(file);
  return new Response(body, { headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" } });
});

const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Mirai Board Audit Governance MVP: http://localhost:${info.port}`);
});
