import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { writeAuditEvent } from "../audit.ts";
import { AppError } from "../errors.ts";
import { nowIso, uuid } from "../ids.ts";
import { authMiddleware, requirePerm, type AppVars } from "../middleware.ts";

const draftSchema = z.object({
  agendaItemId: z.string().min(1),
  notes: z.string().optional(),
});

const reviewSchema = z.object({
  approved: z.boolean(),
  comment: z.string().optional(),
});

export function aiRoutes() {
  const app = new Hono<{ Variables: AppVars }>();
  app.use("*", authMiddleware);

  app.post("/drafts", requirePerm("ai:use"), zValidator("json", draftSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", body.agendaItemId);
    if (!agenda) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const pkg = await deps.db.first<Record<string, unknown>>(
      "SELECT * FROM deliberation_packages WHERE agenda_id = ? ORDER BY version DESC LIMIT 1",
      body.agendaItemId,
    );
    const sources = pkg
      ? await deps.db.all<Record<string, unknown>>(
          "SELECT title, source_id, source_version, citation_locator, content_excerpt FROM deliberation_package_items WHERE package_id = ?",
          String(pkg.id),
        )
      : [];
    if (sources.length === 0) {
      throw new AppError("AI_GUARD", "出典（審議資料パッケージ）がないため草案を生成できません", 422);
    }
    // 規則ベースのデモ草案（外部LLM不使用）。全主張に出典引用を付与する。
    const citations = sources.map((s, i) => ({
      index: i + 1,
      title: String(s.title),
      sourceId: String(s.source_id),
      sourceVersion: String(s.source_version),
      locator: String(s.citation_locator ?? ""),
    }));
    const points = sources.slice(0, 5).map((s, i) => {
      const excerpt = String(s.content_excerpt ?? s.title);
      return `${i + 1}. ${excerpt}（出典${i + 1}）`;
    });
    const id = uuid();
    const draftBody = [
      `【AI草案（デモ・規則ベース）】議案: ${String(agenda.title)}`,
      body.notes ? `補足: ${body.notes}` : null,
      "論点整理:",
      ...points,
      "信頼限界: 本草案は人の承認まで正式記録になりません。決議・投票をAIが確定することはありません。",
    ]
      .filter(Boolean)
      .join("\n");
    await deps.db.run(
      "INSERT INTO ai_drafts (id, agenda_id, body, citations, status, created_by, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
      id,
      body.agendaItemId,
      draftBody,
      JSON.stringify(citations),
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "ai.draft.create", resourceType: "agenda_item", resourceId: body.agendaItemId, correlationId: c.get("correlationId") });
    return c.json({ item: { id, agendaId: body.agendaItemId, body: draftBody, citations, status: "draft", model: "rule-based-demo" } }, 201);
  });

  app.post("/drafts/:id/review", requirePerm("ai:use"), zValidator("json", reviewSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    const draft = await deps.db.first<Record<string, unknown>>("SELECT * FROM ai_drafts WHERE id = ?", id);
    if (!draft) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (String(draft.created_by) === user.id) {
      throw new AppError("SOD", "草案の作成者自身はレビューできません", 409);
    }
    const at = nowIso();
    await deps.db.run(
      "UPDATE ai_drafts SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      body.approved ? "reviewed" : "rejected",
      user.id,
      at,
      id,
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "ai.draft.review", resourceType: "ai_draft", resourceId: id, resourceVersion: body.approved ? "approved" : "rejected", correlationId: c.get("correlationId") });
    return c.json({ item: { id, status: body.approved ? "reviewed" : "rejected" } });
  });

  app.post("/drafts/:id/save", requirePerm("ai:use"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const id = c.req.param("id")!;
    const draft = await deps.db.first<Record<string, unknown>>("SELECT * FROM ai_drafts WHERE id = ?", id);
    if (!draft) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const citations = JSON.parse(String(draft.citations ?? "[]")) as unknown[];
    if (citations.length === 0) {
      throw new AppError("AI_GUARD", "出典不足の草案は保存できません", 422);
    }
    if (String(draft.status) !== "reviewed") {
      throw new AppError("AI_GUARD", "人レビュー完了前の草案は保存できません", 409);
    }
    const at = nowIso();
    await deps.db.run("UPDATE ai_drafts SET status = 'saved', saved_at = ? WHERE id = ?", at, id);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "ai.draft.save", resourceType: "ai_draft", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, status: "saved" } });
  });

  app.post("/drafts/:id/share", requirePerm("ai:use"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const id = c.req.param("id")!;
    const draft = await deps.db.first<Record<string, unknown>>("SELECT * FROM ai_drafts WHERE id = ?", id);
    if (!draft) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (String(draft.status) !== "saved") {
      throw new AppError("AI_GUARD", "保存・レビュー済みの草案のみ共有できます", 409);
    }
    const at = nowIso();
    await deps.db.run("UPDATE ai_drafts SET status = 'shared', shared_at = ? WHERE id = ?", at, id);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "ai.draft.share", resourceType: "ai_draft", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, status: "shared" } });
  });

  return app;
}
