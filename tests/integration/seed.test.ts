import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestApp } from "../helpers.ts";

describe("デモデータseedの冪等性", () => {
  it("再実行してもデータが重複せず、Manifest重複エラーも起きない", async () => {
    const { app } = await createTestApp();
    const headers = { "content-type": "application/json", "x-seed-key": "test-seed-key" };
    const first = await app.request("/api/dev/seed", { method: "POST", headers, body: "{}" });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { summary: { auditEvents: number; manifests: number } };
    const second = await app.request("/api/dev/seed", { method: "POST", headers, body: "{}" });
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as { summary: { auditEvents: number; manifests: number; alreadySeeded?: number } };
    assert.equal(secondBody.summary.alreadySeeded, 1);
    assert.equal(secondBody.summary.auditEvents, firstBody.summary.auditEvents);
    assert.equal(secondBody.summary.manifests, firstBody.summary.manifests);
  });

  it("シードキー不一致は403", async () => {
    const { app } = await createTestApp();
    const res = await app.request("/api/dev/seed", { method: "POST", headers: { "content-type": "application/json", "x-seed-key": "wrong" }, body: "{}" });
    assert.equal(res.status, 403);
  });
});
