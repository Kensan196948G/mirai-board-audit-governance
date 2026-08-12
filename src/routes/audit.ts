import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prepareAuditEvent, writeAuditEvent } from "../audit.ts";
import { assertNotSameActor, transitionFinding } from "../domain.ts";
import { AppError } from "../errors.ts";
import { nowIso, sha256Hex, uuid } from "../ids.ts";
import { nextManifestId } from "../manifest.ts";
import { authMiddleware, requirePerm, type AppVars } from "../middleware.ts";
import { notifyUser } from "../services/notify.ts";

const universeSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  owner: z.string().optional(),
  description: z.string().optional(),
});

const riskSchema = z.object({
  universeId: z.string().min(1),
  fiscalYear: z.number().int().min(2000),
  inherentRisk: z.number().int().min(1).max(5),
  controlRisk: z.number().int().min(1).max(5),
  basis: z.string().optional(),
});

const planSchema = z.object({
  fiscalYear: z.number().int().min(2000),
  title: z.string().min(1),
  itemIds: z.array(z.string()).default([]),
});

const engagementSchema = z.object({
  annualPlanId: z.string().optional(),
  universeId: z.string().optional(),
  title: z.string().min(1),
  scope: z.string().optional(),
  startOn: z.string().optional(),
  endOn: z.string().optional(),
  ownerId: z.string().optional(),
});

const procedureSchema = z.object({
  title: z.string().min(1),
  objective: z.string().optional(),
  populationCount: z.number().int().min(0).default(0),
  sampleCount: z.number().int().min(0).default(0),
  samplingBasis: z.string().optional(),
});

const workpaperSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});

const reviewDecisionSchema = z.object({
  decision: z.enum(["approve", "return"]),
  comment: z.string().optional(),
});

const findingSchema = z.object({
  engagementId: z.string().min(1),
  workpaperId: z.string().optional(),
  title: z.string().min(1),
  criterion: z.string().min(1),
  fact: z.string().min(1),
  cause: z.string().optional(),
  impact: z.string().optional(),
  recommendation: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

const responseSchema = z.object({
  agree: z.boolean(),
  responseText: z.string().min(1),
  plan: z.string().optional(),
  dueAt: z.string().optional(),
});

const riskAcceptanceSchema = z.object({
  acceptorId: z.string().min(1),
  authority: z.string().min(1),
  rationale: z.string().min(1),
  expiryAt: z.string().optional(),
});

const remediationSchema = z.object({
  description: z.string().min(1),
  dueAt: z.string().optional(),
  ownerId: z.string().optional(),
});

const retestSchema = z.object({
  result: z.enum(["closed", "reopened"]),
  note: z.string().optional(),
});

export function auditRoutes() {
  const app = new Hono<{ Variables: AppVars }>();
  app.use("/audit-universes/*", authMiddleware);
  app.use("/risk-assessments/*", authMiddleware);
  app.use("/annual-plans/*", authMiddleware);
  app.use("/engagements/*", authMiddleware);
  app.use("/procedures/*", authMiddleware);
  app.use("/workpapers/*", authMiddleware);
  app.use("/reviews/*", authMiddleware);
  app.use("/findings/*", authMiddleware);

  app.get("/audit-universes", requirePerm("audit:universe"), async (c) => {
    const deps = c.get("deps");
    const items = await deps.db.all("SELECT * FROM audit_universes ORDER BY created_at");
    return c.json({ items, total: items.length });
  });

  app.post("/audit-universes", requirePerm("audit:universe"), zValidator("json", universeSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    const id = uuid();
    await deps.db.run(
      "INSERT INTO audit_universes (id, name, category, owner, description, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      id,
      body.name,
      body.category,
      body.owner ?? null,
      body.description ?? null,
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.universe.create", resourceType: "audit_universe", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, name: body.name } }, 201);
  });

  app.get("/risk-assessments", requirePerm("audit:risk"), async (c) => {
    const deps = c.get("deps");
    const items = await deps.db.all("SELECT ra.*, au.name AS universe_name FROM risk_assessments ra JOIN audit_universes au ON au.id = ra.universe_id ORDER BY ra.fiscal_year DESC");
    return c.json({ items, total: items.length });
  });

  app.post("/risk-assessments", requirePerm("audit:risk"), zValidator("json", riskSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    const universe = await deps.db.first<Record<string, unknown>>("SELECT * FROM audit_universes WHERE id = ?", body.universeId);
    if (!universe) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const id = uuid();
    const score = Math.round((body.inherentRisk + body.controlRisk) / 2);
    await deps.db.run(
      "INSERT INTO risk_assessments (id, universe_id, fiscal_year, inherent_risk, control_risk, score, basis, status, assessed_by, assessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'assessed', ?, ?)",
      id,
      body.universeId,
      body.fiscalYear,
      body.inherentRisk,
      body.controlRisk,
      score,
      body.basis ?? null,
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.risk.assess", resourceType: "risk_assessment", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, score } }, 201);
  });

  app.get("/annual-plans", requirePerm("audit:plan"), async (c) => {
    const deps = c.get("deps");
    const items = await deps.db.all("SELECT * FROM annual_plans ORDER BY fiscal_year DESC");
    return c.json({ items, total: items.length });
  });

  app.post("/annual-plans", requirePerm("audit:plan"), zValidator("json", planSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    const id = uuid();
    await deps.db.run(
      "INSERT INTO annual_plans (id, fiscal_year, title, status, approved_by, approved_at, items, created_by, created_at) VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?)",
      id,
      body.fiscalYear,
      body.title,
      user.id,
      nowIso(),
      JSON.stringify(body.itemIds),
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.plan.create", resourceType: "annual_plan", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, title: body.title } }, 201);
  });

  app.get("/engagements", requirePerm("audit:engagement"), async (c) => {
    const deps = c.get("deps");
    const items = await deps.db.all(
      "SELECT e.*, u.name AS owner_name, au.name AS universe_name FROM engagements e LEFT JOIN users u ON u.id = e.owner_id LEFT JOIN audit_universes au ON au.id = e.universe_id ORDER BY e.created_at DESC",
    );
    return c.json({ items, total: items.length });
  });

  app.post("/engagements", requirePerm("audit:engagement"), zValidator("json", engagementSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    if (body.annualPlanId) {
      const plan = await deps.db.first<Record<string, unknown>>("SELECT * FROM annual_plans WHERE id = ?", body.annualPlanId);
      if (!plan) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    }
    const id = uuid();
    await deps.db.run(
      `INSERT INTO engagements (id, annual_plan_id, universe_id, title, scope, status, start_on, end_on, owner_id, independence_declared, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, 1, ?, ?)`,
      id,
      body.annualPlanId ?? null,
      body.universeId ?? null,
      body.title,
      body.scope ?? null,
      body.startOn ?? null,
      body.endOn ?? null,
      body.ownerId ?? user.id,
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.engagement.create", resourceType: "engagement", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, title: body.title, status: "planned" } }, 201);
  });

  app.get("/engagements/:id", requirePerm("audit:engagement"), async (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id")!;
    const row = await deps.db.first<Record<string, unknown>>(
      "SELECT e.*, u.name AS owner_name FROM engagements e LEFT JOIN users u ON u.id = e.owner_id WHERE e.id = ?",
      id,
    );
    if (!row) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const procedures = await deps.db.all("SELECT * FROM procedures WHERE engagement_id = ? ORDER BY created_at", id);
    const proceduresWithPapers = [];
    for (const p of procedures) {
      const workpapers = await deps.db.all(
        "SELECT w.*, au.name AS author_name, rv.name AS reviewer_name FROM workpapers w LEFT JOIN users au ON au.id = w.author_id LEFT JOIN users rv ON rv.id = w.reviewer_id WHERE w.procedure_id = ?",
        String(p.id),
      );
      proceduresWithPapers.push({ ...p, workpapers });
    }
    const findings = await deps.db.all(
      "SELECT f.*, u.name AS created_by_name FROM findings f LEFT JOIN users u ON u.id = f.created_by WHERE f.engagement_id = ? ORDER BY f.created_at",
      id,
    );
    return c.json({ item: { ...row, procedures: proceduresWithPapers, findings } });
  });

  app.post("/engagements/:id/procedures", requirePerm("procedure:create"), zValidator("json", procedureSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const engagementId = c.req.param("id")!;
    const body = c.req.valid("json");
    const eng = await deps.db.first<Record<string, unknown>>("SELECT * FROM engagements WHERE id = ?", engagementId);
    if (!eng) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const id = uuid();
    await deps.db.run(
      `INSERT INTO procedures (id, engagement_id, title, objective, population_count, sample_count, sampling_basis, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)`,
      id,
      engagementId,
      body.title,
      body.objective ?? null,
      body.populationCount,
      body.sampleCount,
      body.samplingBasis ?? null,
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.procedure.create", resourceType: "procedure", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, title: body.title } }, 201);
  });

  app.post("/procedures/:id/workpapers", requirePerm("workpaper:create"), zValidator("json", workpaperSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const procedureId = c.req.param("id")!;
    const body = c.req.valid("json");
    const proc = await deps.db.first<Record<string, unknown>>("SELECT * FROM procedures WHERE id = ?", procedureId);
    if (!proc) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const id = uuid();
    const at = nowIso();
    const sha = await sha256Hex(body.content);
    await deps.db.batch([
      {
        sql: `INSERT INTO workpapers (id, procedure_id, title, content, version_no, author_id, reviewer_id, approver_id, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, 1, ?, NULL, NULL, 'draft', ?, ?)`,
        params: [id, procedureId, body.title, body.content, user.id, at, at],
      },
      {
        sql: `INSERT INTO workpaper_versions (id, workpaper_id, version_no, content, evidence_refs, created_by, created_at, sha256_full)
              VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
        params: [uuid(), id, body.content, JSON.stringify(body.evidenceRefs), user.id, at, sha],
      },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.workpaper.create", resourceType: "workpaper", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, title: body.title, status: "draft" } }, 201);
  });

  app.get("/workpapers/:id", requirePerm("workpaper:create", "workpaper:review", "workpaper:approve"), async (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id")!;
    const row = await deps.db.first<Record<string, unknown>>(
      "SELECT w.*, au.name AS author_name, rv.name AS reviewer_name, p.engagement_id FROM workpapers w LEFT JOIN users au ON au.id = w.author_id LEFT JOIN users rv ON rv.id = w.reviewer_id JOIN procedures p ON p.id = w.procedure_id WHERE w.id = ?",
      id,
    );
    if (!row) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const versions = await deps.db.all("SELECT * FROM workpaper_versions WHERE workpaper_id = ? ORDER BY version_no", id);
    const reviews = await deps.db.all("SELECT * FROM review_signoffs WHERE workpaper_id = ? ORDER BY created_at", id);
    return c.json({ item: { ...row, versions, reviews } });
  });

  app.post("/workpapers/:id/versions", requirePerm("workpaper:create"), zValidator("json", workpaperSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const workpaperId = c.req.param("id")!;
    const body = c.req.valid("json");
    const wp = await deps.db.first<Record<string, unknown>>("SELECT * FROM workpapers WHERE id = ?", workpaperId);
    if (!wp) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (String(wp.author_id) !== user.id) throw new AppError("FORBIDDEN", "作成者のみ新版を作成できます", 403);
    const at = nowIso();
    const versionNo = Number(wp.version_no) + 1;
    const sha = await sha256Hex(body.content);
    await deps.db.batch([
      {
        sql: "INSERT INTO workpaper_versions (id, workpaper_id, version_no, content, evidence_refs, created_by, created_at, sha256_full) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params: [uuid(), workpaperId, versionNo, body.content, JSON.stringify(body.evidenceRefs), user.id, at, sha],
      },
      {
        sql: "UPDATE workpapers SET content = ?, version_no = ?, reviewer_id = NULL, status = 'draft', updated_at = ? WHERE id = ?",
        params: [body.content, versionNo, at, workpaperId],
      },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.workpaper.version", resourceType: "workpaper", resourceId: workpaperId, resourceVersion: String(versionNo), correlationId: c.get("correlationId") });
    return c.json({ item: { id: workpaperId, versionNo, status: "draft" } }, 201);
  });

  app.post("/workpapers/:id/review-requests", requirePerm("workpaper:review"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const workpaperId = c.req.param("id")!;
    const wp = await deps.db.first<Record<string, unknown>>("SELECT * FROM workpapers WHERE id = ?", workpaperId);
    if (!wp) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    assertNotSameActor(user.id, String(wp.author_id), "調書の作成者は自分自身をレビューできません");
    if (String(wp.status) !== "draft") throw new AppError("CONFLICT", "レビュー中の調書には再依頼できません", 409);
    const at = nowIso();
    await deps.db.batch([
      { sql: "UPDATE workpapers SET reviewer_id = ?, status = 'in_review', updated_at = ? WHERE id = ?", params: [user.id, at, workpaperId] },
      {
        sql: "INSERT INTO review_signoffs (id, workpaper_id, reviewer_id, decision, comment, version_no, created_at) VALUES (?, ?, ?, 'pending', NULL, ?, ?)",
        params: [uuid(), workpaperId, user.id, Number(wp.version_no), at],
      },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.workpaper.review_request", resourceType: "workpaper", resourceId: workpaperId, resourceVersion: String(wp.version_no), correlationId: c.get("correlationId") });
    await notifyUser(deps.db, String(wp.author_id), "調書のレビュー依頼", `調書「${String(wp.title)}」のレビューが開始されました`, "workpaper_review", "workpaper", workpaperId);
    return c.json({ item: { id: workpaperId, status: "in_review" } }, 201);
  });

  app.post("/reviews/:id/decisions", requirePerm("workpaper:review", "workpaper:approve"), zValidator("json", reviewDecisionSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const reviewId = c.req.param("id")!;
    const body = c.req.valid("json");
    const signoff = await deps.db.first<Record<string, unknown>>("SELECT * FROM review_signoffs WHERE id = ?", reviewId);
    if (!signoff) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (String(signoff.reviewer_id) !== user.id) throw new AppError("FORBIDDEN", "レビュー担当者のみ決定できます", 403);
    const wp = await deps.db.first<Record<string, unknown>>("SELECT * FROM workpapers WHERE id = ?", String(signoff.workpaper_id));
    if (!wp) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    assertNotSameActor(user.id, String(wp.author_id), "調書の作成者は自分自身のレビューを完了できません");
    const at = nowIso();
    const targetStatus = body.decision === "approve" ? "reviewed" : "draft";
    await deps.db.batch([
      { sql: "UPDATE review_signoffs SET decision = ?, comment = ?, created_at = ? WHERE id = ?", params: [body.decision, body.comment ?? null, at, reviewId] },
      {
        sql: "UPDATE workpapers SET status = ?, reviewer_id = ?, updated_at = ? WHERE id = ?",
        params: [targetStatus, body.decision === "return" ? null : user.id, at, String(signoff.workpaper_id)],
      },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.workpaper.review", resourceType: "workpaper", resourceId: String(signoff.workpaper_id), resourceVersion: body.decision, correlationId: c.get("correlationId") });
    return c.json({ item: { id: reviewId, decision: body.decision, status: targetStatus } });
  });

  app.get("/findings", requirePerm("finding:create", "finding:finalize", "finding:respond"), async (c) => {
    const deps = c.get("deps");
    const items = await deps.db.all(
      "SELECT f.*, e.title AS engagement_title, u.name AS created_by_name FROM findings f JOIN engagements e ON e.id = f.engagement_id LEFT JOIN users u ON u.id = f.created_by ORDER BY f.created_at DESC",
    );
    return c.json({ items, total: items.length });
  });

  app.post("/findings", requirePerm("finding:create"), zValidator("json", findingSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    const eng = await deps.db.first<Record<string, unknown>>("SELECT * FROM engagements WHERE id = ?", body.engagementId);
    if (!eng) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const id = uuid();
    await deps.db.run(
      `INSERT INTO findings (id, engagement_id, workpaper_id, title, criterion, fact, cause, impact, recommendation, severity, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      id,
      body.engagementId,
      body.workpaperId ?? null,
      body.title,
      body.criterion,
      body.fact,
      body.cause ?? null,
      body.impact ?? null,
      body.recommendation ?? null,
      body.severity,
      user.id,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.finding.create", resourceType: "finding", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: { id, title: body.title, status: "draft" } }, 201);
  });

  app.get("/findings/:id", requirePerm("finding:create", "finding:finalize", "finding:respond"), async (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id")!;
    const row = await deps.db.first<Record<string, unknown>>(
      "SELECT f.*, e.title AS engagement_title FROM findings f JOIN engagements e ON e.id = f.engagement_id WHERE f.id = ?",
      id,
    );
    if (!row) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const [responses, acceptances, remediations, retests] = await Promise.all([
      deps.db.all("SELECT * FROM management_responses WHERE finding_id = ? ORDER BY created_at", id),
      deps.db.all("SELECT * FROM risk_acceptances WHERE finding_id = ? ORDER BY created_at", id),
      deps.db.all("SELECT * FROM remediations WHERE finding_id = ? ORDER BY created_at", id),
      deps.db.all("SELECT * FROM retests WHERE finding_id = ? ORDER BY tested_at", id),
    ]);
    return c.json({ item: { ...row, responses, acceptances, remediations, retests } });
  });

  app.post("/findings/:id/finalize", requirePerm("finding:finalize"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const findingId = c.req.param("id")!;
    const finding = await deps.db.first<Record<string, unknown>>("SELECT * FROM findings WHERE id = ?", findingId);
    if (!finding) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    assertNotSameActor(user.id, String(finding.created_by), "指摘の作成者は自分自身で確定できません");
    transitionFinding(String(finding.status), "finalized");
    const at = nowIso();
    const manifestId = await nextManifestId(deps.db);
    const auditOp = await prepareAuditEvent(deps.db, { actorId: user.id, action: "audit.finding.finalize", resourceType: "finding", resourceId: findingId, resourceVersion: String(finding.severity), correlationId: c.get("correlationId") });
    const manifestContent = {
      manifestId,
      subjectType: "finding",
      subjectId: findingId,
      fixedAt: at,
      fixedBy: user.id,
      finding: {
        title: String(finding.title),
        criterion: String(finding.criterion),
        fact: String(finding.fact),
        severity: String(finding.severity),
      },
      auditEventId: auditOp.id,
      previousManifestId: null,
    };
    const sha = await sha256Hex(JSON.stringify(manifestContent));
    await deps.db.batch([
      { sql: "UPDATE findings SET status = 'finalized', finalized_by = ?, finalized_at = ? WHERE id = ?", params: [user.id, at, findingId] },
      {
        sql: "INSERT INTO evidence_manifests (id, subject_type, subject_id, package_id, content, sha256_full, fixed_at, fixed_by, previous_manifest_id, status) VALUES (?, 'finding', ?, NULL, ?, ?, ?, ?, NULL, 'sealed')",
        params: [manifestId, findingId, JSON.stringify(manifestContent), sha, at, user.id],
      },
      auditOp,
    ]);
    return c.json({ item: { id: findingId, status: "finalized", evidenceManifestId: manifestId } }, 201);
  });

  app.post("/findings/:id/management-responses", requirePerm("finding:respond"), zValidator("json", responseSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const findingId = c.req.param("id")!;
    const body = c.req.valid("json");
    const finding = await deps.db.first<Record<string, unknown>>("SELECT * FROM findings WHERE id = ?", findingId);
    if (!finding) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const at = nowIso();
    await deps.db.batch([
      {
        sql: "INSERT INTO management_responses (id, finding_id, agree, response_text, plan, due_at, respondent_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)",
        params: [uuid(), findingId, body.agree ? 1 : 0, body.responseText, body.plan ?? null, body.dueAt ?? null, user.id, at],
      },
      { sql: "UPDATE findings SET status = 'awaiting_response' WHERE id = ? AND status IN ('finalized','awaiting_response')", params: [findingId] },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.finding.respond", resourceType: "finding", resourceId: findingId, correlationId: c.get("correlationId") });
    await notifyUser(deps.db, String(finding.created_by), "経営回答が提出されました", String(finding.title), "finding_response", "finding", findingId);
    return c.json({ item: { findingId, status: "awaiting_response" } }, 201);
  });

  app.post("/findings/:id/risk-acceptances", requirePerm("finding:respond"), zValidator("json", riskAcceptanceSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const findingId = c.req.param("id")!;
    const body = c.req.valid("json");
    const finding = await deps.db.first<Record<string, unknown>>("SELECT * FROM findings WHERE id = ?", findingId);
    if (!finding) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    await deps.db.run(
      "INSERT INTO risk_acceptances (id, finding_id, acceptor_id, authority, rationale, expiry_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)",
      uuid(),
      findingId,
      body.acceptorId,
      body.authority,
      body.rationale,
      body.expiryAt ?? null,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.finding.risk_acceptance", resourceType: "finding", resourceId: findingId, correlationId: c.get("correlationId") });
    return c.json({ item: { findingId } }, 201);
  });

  app.post("/findings/:id/remediations", requirePerm("finding:respond"), zValidator("json", remediationSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const findingId = c.req.param("id")!;
    const body = c.req.valid("json");
    const finding = await deps.db.first<Record<string, unknown>>("SELECT * FROM findings WHERE id = ?", findingId);
    if (!finding) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const at = nowIso();
    await deps.db.batch([
      {
        sql: "INSERT INTO remediations (id, finding_id, description, due_at, owner_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'in_progress', ?)",
        params: [uuid(), findingId, body.description, body.dueAt ?? null, body.ownerId ?? user.id, at],
      },
      { sql: "UPDATE findings SET status = 'remediating' WHERE id = ? AND status IN ('awaiting_response','remediating','reopened')", params: [findingId] },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "audit.finding.remediate", resourceType: "finding", resourceId: findingId, correlationId: c.get("correlationId") });
    return c.json({ item: { findingId, status: "remediating" } }, 201);
  });

  app.post("/findings/:id/retests", requirePerm("finding:retest"), zValidator("json", retestSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const findingId = c.req.param("id")!;
    const body = c.req.valid("json");
    const finding = await deps.db.first<Record<string, unknown>>("SELECT * FROM findings WHERE id = ?", findingId);
    if (!finding) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    assertNotSameActor(user.id, String(finding.created_by), "指摘の作成者は自分自身で再検証できません");
    const respondent = await deps.db.first<Record<string, unknown>>("SELECT respondent_id FROM management_responses WHERE finding_id = ? ORDER BY created_at DESC LIMIT 1", findingId);
    assertNotSameActor(user.id, String(respondent?.respondent_id ?? ""), "被監査部門の回答者は自分自身で再検証できません");
    transitionFinding(String(finding.status), "retesting");
    const at = nowIso();
    const retestId = uuid();
    const manifestId = await nextManifestId(deps.db);
    const auditOp = await prepareAuditEvent(deps.db, { actorId: user.id, action: "audit.finding.retest", resourceType: "finding", resourceId: findingId, resourceVersion: body.result, correlationId: c.get("correlationId") });
    const prevManifest = await deps.db.first<Record<string, unknown>>(
      "SELECT id FROM evidence_manifests WHERE subject_type = 'finding' AND subject_id = ? ORDER BY fixed_at DESC LIMIT 1",
      findingId,
    );
    const manifestContent = {
      manifestId,
      subjectType: "retest",
      subjectId: retestId,
      fixedAt: at,
      fixedBy: user.id,
      result: body.result,
      note: body.note ?? null,
      auditEventId: auditOp.id,
      previousManifestId: prevManifest ? String(prevManifest.id) : null,
    };
    const sha = await sha256Hex(JSON.stringify(manifestContent));
    const ops = [
      { sql: "UPDATE findings SET status = 'retesting' WHERE id = ?", params: [findingId] },
      {
        sql: "INSERT INTO retests (id, finding_id, tester_id, result, note, tested_at, evidence_manifest_id, reopened_finding_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params: [retestId, findingId, user.id, body.result, body.note ?? null, at, manifestId, null],
      },
      {
        sql: "INSERT INTO evidence_manifests (id, subject_type, subject_id, package_id, content, sha256_full, fixed_at, fixed_by, previous_manifest_id, status) VALUES (?, 'retest', ?, NULL, ?, ?, ?, ?, ?, 'sealed')",
        params: [manifestId, retestId, JSON.stringify(manifestContent), sha, at, user.id, prevManifest ? String(prevManifest.id) : null],
      },
      { sql: "UPDATE findings SET status = 'closed' WHERE id = ?", params: [findingId] },
      auditOp,
    ];
    let reopenedId: string | null = null;
    if (body.result === "reopened") {
      reopenedId = uuid();
      ops.push({
        sql: `INSERT INTO findings (id, engagement_id, workpaper_id, title, criterion, fact, cause, impact, recommendation, severity, status, finalized_by, finalized_at, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reopened', ?, ?, ?, ?)`,
        params: [reopenedId, String(finding.engagement_id), finding.workpaper_id ? String(finding.workpaper_id) : null, `${String(finding.title)}（再オープン）`, String(finding.criterion), String(finding.fact), finding.cause ? String(finding.cause) : null, finding.impact ? String(finding.impact) : null, finding.recommendation ? String(finding.recommendation) : null, String(finding.severity), user.id, at, user.id, at],
      });
      ops.push({ sql: "UPDATE findings SET status = 'reopened' WHERE id = ?", params: [findingId] });
      ops.push({ sql: "UPDATE retests SET reopened_finding_id = ? WHERE id = ?", params: [reopenedId, retestId] });
    }
    await deps.db.batch(ops);
    return c.json({ item: { id: findingId, status: body.result === "closed" ? "closed" : "reopened", evidenceManifestId: manifestId, reopenedFindingId: reopenedId } }, 201);
  });

  return app;
}
