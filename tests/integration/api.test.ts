import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestApp, get, login, post } from "../helpers.ts";

describe("認証・RBAC", () => {
  it("デモユーザーでログインでき、監査役は議決権を持たない", async () => {
    const { app } = await createTestApp();
    const token = await login(app, "user-kansa-1");
    const me = await get(app, "/api/auth/me", token);
    assert.equal(me.status, 200);
    const body = (await me.json()) as { permissions: string[] };
    assert.ok(!body.permissions.includes("vote:cast"));
  });

  it("未認証は401、権限外リソースは404（存在非露出）", async () => {
    const { app } = await createTestApp();
    const unauth = await app.request("/api/agenda-items");
    assert.equal(unauth.status, 401);
    const owner = await login(app, "user-owner-1");
    // business_owner は議決権・監査ログ閲覧権がない → 404
    const votes = await get(app, "/api/agenda-items/ag-001/eligibility", owner);
    assert.equal(votes.status, 404);
    const auditlog = await get(app, "/api/audit-events", owner);
    assert.equal(auditlog.status, 404);
  });

  it("監査役は議決APIで403/404（議決権なし）", async () => {
    const { app } = await createTestApp();
    const token = await login(app, "user-kansa-1");
    const res = await post(app, "/api/agenda-items/ag-001/votes", token, { userId: "user-kansa-1", option: "approve" });
    assert.equal(res.status, 404);
  });
});

describe("議案・決議・Evidence Manifest", () => {
  it("決議確定でManifestが原子的に生成され検証できる", async () => {
    const { app } = await createTestApp();
    const secretariat = await login(app, "user-secretariat-1");
    // ag-001 は投票済み・定足数充足の状態 → 決議確定
    const res = await post(app, "/api/agenda-items/ag-001/decisions", secretariat, {
      outcome: "passed",
      conditions: "従業員承継条件の履行状況を四半期報告に含める",
      dissent: "社外取締役1名の反対意見を記録",
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { item: { manifest: { id: string; sha256Full: string } } };
    const manifestId = body.item.manifest.id;
    const verify = await post(app, `/api/manifests/${manifestId}/verify`, secretariat, {});
    assert.equal(verify.status, 200);
    const vbody = (await verify.json()) as { item: { valid: boolean } };
    assert.equal(vbody.item.valid, true);
    // 二重確定は 409
    const dup = await post(app, "/api/agenda-items/ag-001/decisions", secretariat, { outcome: "passed" });
    assert.equal(dup.status, 409);
  });

  it("定足数不足で可決できない（ag-002 は投票なし）", async () => {
    const { app } = await createTestApp();
    const secretariat = await login(app, "user-secretariat-1");
    const res = await post(app, "/api/agenda-items/ag-002/decisions", secretariat, { outcome: "passed" });
    assert.equal(res.status, 422);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "QUORUM");
  });

  it("COIで忌避された取締役の議決を拒否する", async () => {
    const { app } = await createTestApp();
    const director = await login(app, "user-director-3");
    const res = await post(app, "/api/agenda-items/ag-001/votes", director, { userId: "user-director-3", option: "approve" });
    assert.equal(res.status, 403);
  });

  it("議事録の二重記名を409で拒否する", async () => {
    const { app } = await createTestApp();
    const director = await login(app, "user-director-1");
    const first = await post(app, "/api/minutes/minv-002/signoffs", director, {});
    assert.equal(first.status, 201);
    const second = await post(app, "/api/minutes/minv-002/signoffs", director, {});
    assert.equal(second.status, 409);
  });

  it("履行タスクは独立確認者のみ完了できる", async () => {
    const { app } = await createTestApp();
    const owner = await login(app, "user-owner-2");
    const res = await post(app, "/api/actions/act-001/events", owner, { eventType: "completed", note: "自分で完了扱い" });
    assert.equal(res.status, 403);
  });
});

describe("監査・職務分離", () => {
  it("作成者自身のレビュー依頼・レビュー完了を409で拒否する", async () => {
    const { app } = await createTestApp();
    const auditor = await login(app, "user-auditor-1");
    const req = await post(app, "/api/workpapers/wp-002/review-requests", auditor, {});
    assert.equal(req.status, 409);
    const reviewer = await login(app, "user-auditor-2");
    const req2 = await post(app, "/api/workpapers/wp-002/review-requests", reviewer, {});
    assert.equal(req2.status, 201);
    // 作成者自身がレビュー決定 → 409
    const reviews = (await get(app, "/api/workpapers/wp-002", auditor)).status;
    assert.equal(reviews, 200);
    const reviewId = await getReviewId(app, auditor, "wp-002");
    const dec = await post(app, `/api/reviews/${reviewId}/decisions`, auditor, { decision: "approve" });
    assert.equal(dec.status, 403);
  });

  it("指摘確定・再検証は作成者以外の権限者", async () => {
    const { app } = await createTestApp();
    const auditor = await login(app, "user-auditor-1");
    const selfFinalize = await post(app, "/api/findings/fnd-001/finalize", auditor, {});
    assert.equal(selfFinalize.status, 404);
    const manager = await login(app, "user-audit-manager-1");
    const finalize = await post(app, "/api/findings/fnd-001/finalize", manager, {});
    assert.equal(finalize.status, 201);
    // 回答者自身で再検証 → 409
    const retest = await post(app, "/api/findings/fnd-003/retests", manager, { result: "closed", note: "確認" });
    assert.equal(retest.status, 409);
  });

  it("再検証で再オープンすると新指摘が生成される", async () => {
    const { app } = await createTestApp();
    const manager = await login(app, "user-audit-manager-1");
    const res = await post(app, "/api/findings/fnd-004/retests", manager, { result: "reopened", note: "再発を確認" });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { item: { status: string; reopenedFindingId: string | null } };
    assert.equal(body.item.status, "reopened");
    assert.ok(body.item.reopenedFindingId);
  });
});

describe("保持・法的保全", () => {
  it("法的保全中の廃棄は409、承認者と申請者は別でなければならない", async () => {
    const { app } = await createTestApp();
    const records = await login(app, "user-records-1");
    // disp-001 は申請者=records で pending_approval。同じ人が承認 → 409
    const sameApprove = await post(app, "/api/disposals/disp-001/approve", records, {});
    assert.equal(sameApprove.status, 409);
    const admin = await login(app, "user-admin-1");
    const approve = await post(app, "/api/disposals/disp-001/approve", admin, {});
    assert.equal(approve.status, 200);
    // 法的保全中なので実行は409
    const execute = await post(app, "/api/disposals/disp-001/execute", admin, {});
    assert.equal(execute.status, 409);
    // 保全解除後は実行できる
    const release = await post(app, "/api/legal-holds/hold-001/release", records, { reason: "解除" });
    assert.equal(release.status, 200);
    const execute2 = await post(app, "/api/disposals/disp-001/execute", admin, {});
    assert.equal(execute2.status, 200);
  });
});

describe("AI草案ガード", () => {
  it("出典なしは422、レビュー前保存は409、レビュー後保存・共有は成功", async () => {
    const { app } = await createTestApp();
    const auditor = await login(app, "user-auditor-1");
    const noSource = await post(app, "/api/ai/drafts", auditor, { agendaItemId: "ag-003" });
    assert.equal(noSource.status, 422);
    const ok = await post(app, "/api/ai/drafts", auditor, { agendaItemId: "ag-001" });
    assert.equal(ok.status, 201);
    const draft = (await ok.json()) as { item: { id: string; citations: unknown[] } };
    assert.ok(draft.item.citations.length > 0);
    const saveBeforeReview = await post(app, `/api/ai/drafts/${draft.item.id}/save`, auditor, {});
    assert.equal(saveBeforeReview.status, 409);
    // 作成者自身のレビューは409
    const selfReview = await post(app, `/api/ai/drafts/${draft.item.id}/review`, auditor, { approved: true });
    assert.equal(selfReview.status, 409);
    const manager = await login(app, "user-audit-manager-1");
    const review = await post(app, `/api/ai/drafts/${draft.item.id}/review`, manager, { approved: true });
    assert.equal(review.status, 200);
    const save = await post(app, `/api/ai/drafts/${draft.item.id}/save`, auditor, {});
    assert.equal(save.status, 200);
    const share = await post(app, `/api/ai/drafts/${draft.item.id}/share`, auditor, {});
    assert.equal(share.status, 200);
  });
});

describe("監査ログチェーン・検索・通知", () => {
  it("監査ログチェーンが検証でき、通知の受領・再送ができる", async () => {
    const { app } = await createTestApp();
    const kansa = await login(app, "user-kansa-1");
    const chain = await get(app, "/api/audit-events/verify-chain", kansa);
    assert.equal(chain.status, 200);
    const cbody = (await chain.json()) as { valid: boolean; count: number };
    assert.equal(cbody.valid, true);
    assert.ok(cbody.count >= 20);
    const director = await login(app, "user-director-1");
    const notif = await get(app, "/api/users/me/notifications", director);
    assert.equal(notif.status, 200);
    const nbody = (await notif.json()) as { items: Array<{ id: string }> };
    assert.ok(nbody.items.length > 0);
    const ack = await post(app, `/api/notifications/${nbody.items[0]!.id}/acknowledge`, director, {});
    assert.equal(ack.status, 200);
    const retry = await post(app, `/api/notifications/${nbody.items[0]!.id}/retry`, director, {});
    assert.equal(retry.status, 200);
    const search = await get(app, "/api/search?q=株式", director);
    assert.equal(search.status, 200);
    const sbody = (await search.json()) as { items: unknown[] };
    assert.ok(sbody.items.length > 0);
  });
});

type TestApp = Awaited<ReturnType<typeof createTestApp>>["app"];

async function getReviewId(app: TestApp, token: string, workpaperId: string): Promise<string> {
  const res = await get(app, `/api/workpapers/${workpaperId}`, token);
  const body = (await res.json()) as { item: { reviews: Array<{ id: string }> } };
  const pending = body.item.reviews.find((r) => r.id);
  return pending?.id ?? body.item.reviews[0]!.id;
}
