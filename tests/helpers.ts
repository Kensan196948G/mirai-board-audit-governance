import { join } from "node:path";
import { buildApp, type AppDeps } from "../src/app.ts";
import { SqliteDb } from "../src/db/sqlite.ts";
import { applyMigrations } from "../src/migrate.ts";
import { seedAll } from "../src/seed.ts";

export async function createTestApp(): Promise<{ app: ReturnType<typeof buildApp>; db: SqliteDb }> {
  const db = new SqliteDb(":memory:");
  await applyMigrations(db, join(process.cwd(), "migrations"));
  await seedAll(db);
  const deps: AppDeps = {
    db,
    sessionSecret: "test-secret",
    seedKey: "test-seed-key",
    environment: "test",
  };
  const app = buildApp(deps);
  return { app, db };
}

export async function login(app: ReturnType<typeof buildApp>, userId: string): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

export function auth(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

export async function post(app: ReturnType<typeof buildApp>, path: string, token: string, body: unknown) {
  return app.request(path, { method: "POST", headers: auth(token), body: JSON.stringify(body) });
}

export async function get(app: ReturnType<typeof buildApp>, path: string, token: string) {
  return app.request(path, { headers: auth(token) });
}
