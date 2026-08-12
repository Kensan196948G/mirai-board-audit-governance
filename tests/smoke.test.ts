import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../src/app.ts";
import { SqliteDb } from "../src/db/sqlite.ts";

function makeDb() {
  return new SqliteDb(":memory:");
}

describe("app scaffold", () => {
  it("health endpoint works", async () => {
    const db = makeDb();
    const app = buildApp({ db, sessionSecret: "test", environment: "test" });
    const res = await app.request("/api/health");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("returns standardized error shape", async () => {
    const db = makeDb();
    const app = buildApp({ db, sessionSecret: "test", environment: "test" });
    const res = await app.request("/api/not-found");
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string; correlationId: string } };
    assert.equal(body.error.code, "NOT_FOUND");
    assert.match(body.error.correlationId, /^req_/);
  });
});
