import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prepareAuditEvent, writeAuditEvent } from "../audit.ts";
import { transitionAction, transitionAgenda, calculateQuorum } from "../domain.ts";
import { AppError } from "../errors.ts";
import { nowIso, sha256Hex, uuid } from "../ids.ts";
import { nextManifestId } from "../manifest.ts";
import { authMiddleware, requirePerm, type AppVars } from "../middleware.ts";
import { parseControls, type CoiControls } from "../permissions.ts";
import { notifyUser } from "../services/notify.ts";
import type { Db } from "../db/types.ts";

const agendaCreateSchema = z.object({
  bodyId: z.string().min(1),
  meetingId: z.string().optional(),
  type: z.string().min(1),
  classification: z.string().default("internal"),
  title: z.string().min(1),
  summary: z.string().optional(),
  ownerUserId: z.string().optional(),
  dueAt: z.string().optional(),
  urgent: z.boolean().default(false),
});

const reasonSchema = z.object({ reason: z.string().optional() });

const conflictSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().optional(),
  classification: z.string().default("confidential"),
});

const determinationSchema = z.object({
  determinerId: z.string().min(1),
  decision: z.enum(["eligible", "recused", "pending"]),
  controls: z
    .object({
      view: z.enum(["allowed", "blocked"]).default("allowed"),
      deliberate: z.enum(["allowed", "blocked"]).default("allowed"),
      vote: z.enum(["allowed", "blocked"]).default("allowed"),
      notify: z.enum(["allowed", "blocked"]).default("allowed"),
    })
    .optional(),
  reason: z.string().optional(),
  validUntil: z.string().optional(),
});

const packageSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        sourceType: z.string().min(1),
        sourceId: z.string().min(1),
        sourceVersion: z.string().min(1),
        uri: z.string().optional(),
        sha256Full: z.string().regex(/^[0-9a-f]{64}$/i),
        citationLocator: z.string().optional(),
        classification: z.string().default("confidential"),
        contentExcerpt: z.string().optional(),
      }),
    )
    .min(1),
});

const voteSchema = z.object({
  userId: z.string().min(1),
  option: z.enum(["approve", "approve_with_condition", "oppose", "abstain"]),
  reason: z.string().optional(),
  conditions: z.string().optional(),
});

const decisionSchema = z.object({
  outcome: z.enum(["passed", "rejected", "inconclusive"]),
  conditions: z.string().optional(),
  dissent: z.string().optional(),
});

const opinionSchema = z.object({
  opinionType: z.string().default("prior"),
  body: z.string().min(1),
});

const actionsSchema = z.object({
  actions: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        ownerUserId: z.string().min(1),
        confirmerUserId: z.string().optional(),
        dueAt: z.string().min(1),
        acceptanceCriteria: z.string().optional(),
      }),
    )
    .min(1),
});

const actionEventSchema = z.object({
  eventType: z.enum(["started", "evidence_submitted", "returned", "extended", "completed", "reopened"]),
  note: z.string().optional(),
  evidenceSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
});

const EVENT_TO_STATUS: Record<string, string> = {
  started: "in_progress",
  evidence_submitted: "evidence_submitted",
  returned: "returned",
  extended: "extended",
  completed: "confirmed",
  reopened: "reopened",
};

export function agendaRoutes() {
  const app = new Hono<{ Variables: AppVars }>();
  app.use("/agenda-items/*", authMiddleware);
  app.use("/conflicts/*", authMiddleware);
  app.use("/decisions/*", authMiddleware);
  app.use("/actions/*", authMiddleware);

  app.get("/agenda-items", requirePerm("agenda:view"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const q = c.req.query("q")?.trim() ?? "";
    const status = c.req.query("status");
    const bodyId = c.req.query("bodyId");
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (q) {
      where.push("(title LIKE ? OR summary LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (bodyId) {
      where.push("body_id = ?");
      params.push(bodyId);
    }
    const rows = await deps.db.all<Record<string, unknown>>(
      `SELECT a.*, b.name AS body_name, u.name AS owner_name FROM agenda_items a
       JOIN bodies b ON b.id = a.body_id JOIN users u ON u.id = a.owner_user_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.urgent DESC, a.created_at DESC`,
      ...params,
    );
    const items = rows.filter((r) => canSeeBody(user, String(r.body_id)));
    return c.json({ items, total: items.length });
  });

  app.post("/agenda-items", requirePerm("agenda:create"), zValidator("json", agendaCreateSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const body = c.req.valid("json");
    const bodyRow = await deps.db.first<Record<string, unknown>>("SELECT * FROM bodies WHERE id = ?", body.bodyId);
    if (!bodyRow) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (!canSeeBody(user, body.bodyId)) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const ownerId = body.ownerUserId ?? user.id;
    const owner = await deps.db.first<Record<string, unknown>>("SELECT * FROM users WHERE id = ?", ownerId);
    if (!owner) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const rule = await deps.db.first<Record<string, unknown>>(
      "SELECT * FROM governance_rules WHERE body_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1",
      body.bodyId,
    );
    const id = uuid();
    const at = nowIso();
    await deps.db.batch([
      {
        sql: `INSERT INTO agenda_items (id, meeting_id, body_id, type, classification, title, summary, owner_user_id, status, rule_version_id, due_at, urgent, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?)`,
        params: [id, body.meetingId ?? null, body.bodyId, body.type, body.classification, body.title, body.summary ?? null, ownerId, rule ? String(rule.id) : null, body.dueAt ?? null, body.urgent ? 1 : 0, user.id, at, at],
      },
      {
        sql: "INSERT INTO agenda_status_history (id, agenda_id, from_status, to_status, reason, by_user, at) VALUES (?, ?, 'created', 'created', ?, ?, ?)",
        params: [uuid(), id, "初期作成", user.id, at],
      },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "agenda.create", resourceType: "agenda_item", resourceId: id, correlationId: c.get("correlationId") });
    return c.json({ item: await loadAgendaDetail(deps.db, id) }, 201);
  });

  app.get("/agenda-items/:id", requirePerm("agenda:view"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const id = c.req.param("id")!;
    const row = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", id);
    if (!row || !canSeeBody(user, String(row.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    return c.json({ item: await loadAgendaDetail(deps.db, id) });
  });

  app.post("/agenda-items/:id/submit", requirePerm("agenda:submit"), zValidator("json", reasonSchema), async (c) => mutateAgenda(c, "submit"));
  app.post("/agenda-items/:id/return", requirePerm("agenda:return"), zValidator("json", reasonSchema), async (c) => mutateAgenda(c, "return"));
  app.post("/agenda-items/:id/withdraw", requirePerm("agenda:withdraw"), zValidator("json", reasonSchema), async (c) => mutateAgenda(c, "withdraw"));
  app.post("/agenda-items/:id/resubmit", requirePerm("agenda:resubmit"), zValidator("json", reasonSchema), async (c) => mutateAgenda(c, "resubmit"));

  app.post("/agenda-items/:id/opinions", requirePerm("opinion:create"), zValidator("json", opinionSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const agendaId = c.req.param("id")!;
    const body = c.req.valid("json");
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
    if (!agenda || !canSeeBody(user, String(agenda.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const controls = await effectiveControls(deps.db, agendaId, user.id);
    if (controls.deliberate === "blocked") throw new AppError("FORBIDDEN", "この議案への意見入力は制御されています", 403);
    const id = uuid();
    await deps.db.run(
      "INSERT INTO opinions (id, agenda_id, user_id, opinion_type, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      agendaId,
      user.id,
      body.opinionType,
      body.body,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "agenda.opinion", resourceType: "agenda_item", resourceId: agendaId, correlationId: c.get("correlationId") });
    return c.json({ item: { id, agendaId, userId: user.id, opinionType: body.opinionType } }, 201);
  });

  app.post("/agenda-items/:id/conflicts", requirePerm("conflict:declare"), zValidator("json", conflictSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const agendaId = c.req.param("id")!;
    const body = c.req.valid("json");
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
    if (!agenda || !canSeeBody(user, String(agenda.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const id = uuid();
    await deps.db.run(
      "INSERT INTO conflict_declarations (id, agenda_id, user_id, status, reason, classification, declared_at, declared_by) VALUES (?, ?, ?, 'declared', ?, ?, ?, ?)",
      id,
      agendaId,
      body.userId,
      body.reason ?? null,
      body.classification,
      nowIso(),
      user.id,
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "conflict.declare", resourceType: "agenda_item", resourceId: agendaId, correlationId: c.get("correlationId") });
    return c.json({ item: { id, agendaId, userId: body.userId, status: "declared" } }, 201);
  });

  app.post("/conflicts/:id/determinations", requirePerm("conflict:determine"), zValidator("json", determinationSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const conflictId = c.req.param("id")!;
    const body = c.req.valid("json");
    const conflict = await deps.db.first<Record<string, unknown>>("SELECT * FROM conflict_declarations WHERE id = ?", conflictId);
    if (!conflict) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const id = uuid();
    const controls = body.controls ?? (body.decision === "recused" ? { view: "blocked", deliberate: "blocked", vote: "blocked", notify: "blocked" } : { view: "allowed", deliberate: "allowed", vote: "allowed", notify: "allowed" });
    await deps.db.run(
      `INSERT INTO conflict_determinations (id, conflict_id, determiner_id, decision, controls, reason, rule_version_id, determined_at, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      conflictId,
      body.determinerId,
      body.decision,
      JSON.stringify(controls),
      body.reason ?? null,
      String(conflict.rule_version_id ?? "") || null,
      nowIso(),
      body.validUntil ?? null,
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "conflict.determine", resourceType: "conflict", resourceId: conflictId, resourceVersion: body.decision, correlationId: c.get("correlationId") });
    return c.json({ item: { id, conflictId, decision: body.decision, controls } }, 201);
  });

  app.post("/agenda-items/:id/deliberation-packages", requirePerm("package:fix"), zValidator("json", packageSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const agendaId = c.req.param("id")!;
    const body = c.req.valid("json");
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
    if (!agenda) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const latest = await deps.db.first<Record<string, unknown>>(
      "SELECT * FROM deliberation_packages WHERE agenda_id = ? ORDER BY version DESC LIMIT 1",
      agendaId,
    );
    const packageId = uuid();
    const version = Number(latest?.version ?? 0) + 1;
    const at = nowIso();
    const ops = [
      {
        sql: `INSERT INTO deliberation_packages (id, agenda_id, version, fixed_at, fixed_by, rule_version_id, status, verification_result, previous_id)
              VALUES (?, ?, ?, ?, ?, ?, 'fixed', 'ok', ?)`,
        params: [packageId, agendaId, version, at, user.id, String(agenda.rule_version_id ?? "") || null, latest ? String(latest.id) : null],
      },
      ...body.items.map((item) => ({
        sql: `INSERT INTO deliberation_package_items (id, package_id, title, source_type, source_id, source_version, uri, sha256_full, citation_locator, classification, content_excerpt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [uuid(), packageId, item.title, item.sourceType, item.sourceId, item.sourceVersion, item.uri ?? null, item.sha256Full, item.citationLocator ?? null, item.classification, item.contentExcerpt ?? null],
      })),
    ];
    await deps.db.batch(ops);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "package.fix", resourceType: "agenda_item", resourceId: agendaId, resourceVersion: String(version), correlationId: c.get("correlationId") });
    return c.json({ item: { id: packageId, agendaId, version, status: "fixed", fixedAt: at } }, 201);
  });

  app.get("/agenda-items/:id/eligibility", requirePerm("eligibility:view"), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const agendaId = c.req.param("id")!;
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
    if (!agenda || !canSeeBody(user, String(agenda.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const snapshot = await computeAndSaveEligibility(deps.db, agenda);
    return c.json({ item: snapshot });
  });

  app.post("/agenda-items/:id/votes", requirePerm("vote:cast"), zValidator("json", voteSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const agendaId = c.req.param("id")!;
    const body = c.req.valid("json");
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
    if (!agenda || !canSeeBody(user, String(agenda.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (!agenda.meeting_id) throw new AppError("CONFLICT", "会議が割り当てられていません", 409);
    const meeting = await deps.db.first<Record<string, unknown>>("SELECT * FROM meetings WHERE id = ?", String(agenda.meeting_id));
    if (!meeting || meeting.status !== "in_progress") throw new AppError("CONFLICT", "会議開催中のみ議決できます", 409);
    if (user.role !== "director" && user.role !== "admin") throw new AppError("FORBIDDEN", "議決権がありません", 403);
    if (!user.bodyIds.includes(String(agenda.body_id))) throw new AppError("FORBIDDEN", "議決資格がありません", 403);
    const controls = await effectiveControls(deps.db, agendaId, user.id);
    if (controls.vote === "blocked") throw new AppError("FORBIDDEN", "この議案の議決は制御されています", 403);
    if (body.userId !== user.id) throw new AppError("FORBIDDEN", "本人の議決のみ可能です", 403);
    const existing = await deps.db.first<Record<string, unknown>>("SELECT * FROM individual_votes WHERE agenda_id = ? AND user_id = ?", agendaId, user.id);
    if (existing) throw new AppError("CONFLICT", "すでに議決済みです", 409);
    const id = uuid();
    await deps.db.run(
      "INSERT INTO individual_votes (id, agenda_id, meeting_id, user_id, option, reason, conditions, cast_at, etag_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
      id,
      agendaId,
      String(agenda.meeting_id),
      user.id,
      body.option,
      body.reason ?? null,
      body.conditions ?? null,
      nowIso(),
    );
    await writeAuditEvent(deps.db, { actorId: user.id, action: "agenda.vote", resourceType: "agenda_item", resourceId: agendaId, resourceVersion: body.option, correlationId: c.get("correlationId") });
    return c.json({ item: { id, agendaId, userId: user.id, option: body.option } }, 201);
  });

  app.post("/agenda-items/:id/decisions", requirePerm("decision:finalize"), zValidator("json", decisionSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const agendaId = c.req.param("id")!;
    const body = c.req.valid("json");
    const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
    if (!agenda || !canSeeBody(user, String(agenda.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    if (!["in_review", "decision_pending"].includes(String(agenda.status))) {
      throw new AppError("CONFLICT", "現在の状態では決議を確定できません", 409, { status: String(agenda.status) });
    }
    if (!agenda.meeting_id) throw new AppError("CONFLICT", "会議が割り当てられていません", 409);
    const meeting = await deps.db.first<Record<string, unknown>>("SELECT * FROM meetings WHERE id = ?", String(agenda.meeting_id));
    if (!meeting || meeting.status !== "in_progress") throw new AppError("CONFLICT", "会議開催中のみ決議を確定できます", 409);
    const packageRow = await deps.db.first<Record<string, unknown>>(
      "SELECT * FROM deliberation_packages WHERE agenda_id = ? ORDER BY version DESC LIMIT 1",
      agendaId,
    );
    if (!packageRow) throw new AppError("MANIFEST", "審議資料パッケージが固定されていません", 422);
    const snapshot = await computeAndSaveEligibility(deps.db, agenda);
    const votes = await deps.db.all<Record<string, unknown>>(
      "SELECT v.*, u.name AS user_name FROM individual_votes v JOIN users u ON u.id = v.user_id WHERE v.agenda_id = ?",
      agendaId,
    );
    if (votes.length === 0) throw new AppError("QUORUM", "議決がありません", 422);
    const tally = {
      approve: votes.filter((v) => v.option === "approve").length,
      approve_with_condition: votes.filter((v) => v.option === "approve_with_condition").length,
      oppose: votes.filter((v) => v.option === "oppose").length,
      abstain: votes.filter((v) => v.option === "abstain").length,
      total: votes.length,
    };
    if (body.outcome === "passed" && !snapshot.meetsQuorum) {
      throw new AppError("QUORUM", "定足数に達していないため可決できません", 422, snapshot);
    }
    const decisionId = uuid();
    const manifestId = await nextManifestId(deps.db);
    const auditOp = await prepareAuditEvent(deps.db, {
      actorId: user.id,
      action: "decision.finalize",
      resourceType: "agenda_item",
      resourceId: agendaId,
      resourceVersion: body.outcome,
      correlationId: c.get("correlationId"),
    });
    const manifestContent = {
      manifestId,
      subjectType: "decision",
      subjectId: decisionId,
      packageId: String(packageRow.id),
      fixedAt: nowIso(),
      fixedBy: user.id,
      ruleVersionId: String(agenda.rule_version_id ?? "") || undefined,
      eligibilitySnapshotId: String(snapshot.id),
      votes: votes.map((v) => ({ userId: String(v.user_id), option: String(v.option), reason: v.reason ?? null, conditions: v.conditions ?? null })),
      tally,
      outcome: body.outcome,
      conditions: body.conditions ?? null,
      dissent: body.dissent ?? null,
      auditEventId: auditOp.id,
      previousManifestId: null,
    };
    const sha256Full = await sha256Hex(JSON.stringify(manifestContent));
    const at = nowIso();
    const ops = [
      {
        sql: `INSERT INTO decisions (id, agenda_id, meeting_id, status, outcome, conditions, dissent, tally, decided_at, decided_by, rule_version_id, evidence_manifest_id)
              VALUES (?, ?, ?, 'finalized', ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [decisionId, agendaId, String(agenda.meeting_id), body.outcome, body.conditions ?? null, body.dissent ?? null, JSON.stringify(tally), at, user.id, String(agenda.rule_version_id ?? "") || null, manifestId],
      },
      {
        sql: `INSERT INTO evidence_manifests (id, subject_type, subject_id, package_id, content, sha256_full, fixed_at, fixed_by, previous_manifest_id, status)
              VALUES (?, 'decision', ?, ?, ?, ?, ?, ?, NULL, 'sealed')`,
        params: [manifestId, decisionId, String(packageRow.id), JSON.stringify(manifestContent), sha256Full, manifestContent.fixedAt, user.id],
      },
      {
        sql: "UPDATE agenda_items SET status = 'finalized', updated_at = ? WHERE id = ?",
        params: [at, agendaId],
      },
      {
        sql: "INSERT INTO agenda_status_history (id, agenda_id, from_status, to_status, reason, by_user, at) VALUES (?, ?, ?, 'finalized', ?, ?, ?)",
        params: [uuid(), agendaId, String(agenda.status), body.outcome === "passed" ? "決議可決・結論封緘" : `決議${body.outcome}・結論封緘`, user.id, at],
      },
      auditOp,
    ];
    await deps.db.batch(ops);
    return c.json({
      item: {
        decision: { id: decisionId, agendaId, outcome: body.outcome, conditions: body.conditions ?? null, dissent: body.dissent ?? null, tally, decidedAt: at, decidedBy: user.id, evidenceManifestId: manifestId },
        manifest: { id: manifestId, sha256Full, fixedAt: manifestContent.fixedAt },
      },
    }, 201);
  });

  app.get("/decisions/:id/actions", requirePerm("agenda:view"), async (c) => {
    const deps = c.get("deps");
    const decisionId = c.req.param("id")!;
    const decision = await deps.db.first<Record<string, unknown>>("SELECT * FROM decisions WHERE id = ?", decisionId);
    if (!decision) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const items = await deps.db.all<Record<string, unknown>>(
      "SELECT a.*, u.name AS owner_name, c.name AS confirmer_name FROM actions a LEFT JOIN users u ON u.id = a.owner_user_id LEFT JOIN users c ON c.id = a.confirmer_user_id WHERE a.decision_id = ? ORDER BY a.created_at",
      decisionId,
    );
    return c.json({ items });
  });

  app.post("/decisions/:id/actions", requirePerm("action:manage"), zValidator("json", actionsSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const decisionId = c.req.param("id")!;
    const body = c.req.valid("json");
    const decision = await deps.db.first<Record<string, unknown>>("SELECT * FROM decisions WHERE id = ?", decisionId);
    if (!decision) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const at = nowIso();
    const created: Array<Record<string, unknown>> = [];
    for (const a of body.actions) {
      const id = uuid();
      await deps.db.run(
        `INSERT INTO actions (id, decision_id, agenda_id, title, description, owner_user_id, confirmer_user_id, due_at, acceptance_criteria, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?, ?)`,
        id,
        decisionId,
        String(decision.agenda_id),
        a.title,
        a.description ?? null,
        a.ownerUserId,
        a.confirmerUserId ?? null,
        a.dueAt,
        a.acceptanceCriteria ?? null,
        user.id,
        at,
        at,
      );
      created.push({ id, title: a.title, status: "not_started" });
      await notifyUser(deps.db, a.ownerUserId, "履行タスクが割り当てられました", a.title, "action", "action", id);
      if (a.confirmerUserId) {
        await notifyUser(deps.db, a.confirmerUserId, "独立確認の依頼", a.title, "action_confirm", "action", id);
      }
    }
    await writeAuditEvent(deps.db, { actorId: user.id, action: "action.create", resourceType: "decision", resourceId: decisionId, resourceVersion: String(created.length), correlationId: c.get("correlationId") });
    return c.json({ items: created }, 201);
  });

  app.post("/actions/:id/events", requirePerm("action:manage", "action:confirm"), zValidator("json", actionEventSchema), async (c) => {
    const deps = c.get("deps");
    const user = c.get("user");
    const actionId = c.req.param("id")!;
    const body = c.req.valid("json");
    const action = await deps.db.first<Record<string, unknown>>("SELECT * FROM actions WHERE id = ?", actionId);
    if (!action) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
    const target = EVENT_TO_STATUS[body.eventType]!;
    if (body.eventType === "completed" && user.id !== String(action.confirmer_user_id)) {
      throw new AppError("FORBIDDEN", "独立確認者のみ完了確認できます", 403);
    }
    if (body.eventType !== "completed" && user.id !== String(action.owner_user_id) && user.role !== "admin" && user.role !== "secretariat") {
      throw new AppError("FORBIDDEN", "担当者のみ更新できます", 403);
    }
    transitionAction(String(action.status), target);
    const at = nowIso();
    await deps.db.batch([
      {
        sql: "INSERT INTO action_events (id, action_id, event_type, note, evidence_sha256, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [uuid(), actionId, body.eventType, body.note ?? null, body.evidenceSha256 ?? null, user.id, at],
      },
      { sql: "UPDATE actions SET status = ?, updated_at = ? WHERE id = ?", params: [target, at, actionId] },
    ]);
    await writeAuditEvent(deps.db, { actorId: user.id, action: "action.event", resourceType: "action", resourceId: actionId, resourceVersion: target, correlationId: c.get("correlationId") });
    return c.json({ item: { id: actionId, status: target, eventType: body.eventType, at } });
  });

  return app;
}

async function mutateAgenda(c: Context<{ Variables: AppVars }>, action: "submit" | "return" | "withdraw" | "resubmit") {
  const deps = c.get("deps");
  const user = c.get("user");
  const agendaId = c.req.param("id")!;
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason;
  const agenda = await deps.db.first<Record<string, unknown>>("SELECT * FROM agenda_items WHERE id = ?", agendaId);
  if (!agenda || !canSeeBody(user, String(agenda.body_id))) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
  const to = { submit: "submitted", return: "returned", withdraw: "withdrawn", resubmit: "submitted" }[action];
  transitionAgenda(String(agenda.status), to, reason);
  const at = nowIso();
  await deps.db.batch([
    { sql: "UPDATE agenda_items SET status = ?, updated_at = ? WHERE id = ?", params: [to, at, agendaId] },
    { sql: "INSERT INTO agenda_status_history (id, agenda_id, from_status, to_status, reason, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?)", params: [uuid(), agendaId, String(agenda.status), to, reason ?? null, user.id, at] },
  ]);
  await writeAuditEvent(deps.db, { actorId: user.id, action: `agenda.${action}`, resourceType: "agenda_item", resourceId: agendaId, resourceVersion: to, reason, correlationId: c.get("correlationId") });
  return c.json({ item: { id: agendaId, status: to } });
}

async function computeAndSaveEligibility(db: Db, agenda: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bodyRow = await db.first<Record<string, unknown>>("SELECT * FROM bodies WHERE id = ?", String(agenda.body_id));
  const rule = await db.first<Record<string, unknown>>(
    "SELECT * FROM governance_rules WHERE body_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1",
    String(agenda.body_id),
  );
  let actualAttendees = 0;
  if (agenda.meeting_id) {
    const attend = await db.first<{ cnt: number }>(
      "SELECT COUNT(DISTINCT user_id) AS cnt FROM attendance_events WHERE meeting_id = ? AND event_type IN ('attend','late','reenter','online')",
      String(agenda.meeting_id),
    );
    actualAttendees = attend?.cnt ?? 0;
  }
  const conflicts = await db.all<Record<string, unknown>>(
    `SELECT cd.user_id, d.decision FROM conflict_declarations cd
     LEFT JOIN conflict_determinations d ON d.id = (SELECT id FROM conflict_determinations WHERE conflict_id = cd.id ORDER BY determined_at DESC LIMIT 1)
     WHERE cd.agenda_id = ?`,
    String(agenda.id),
  );
  const recused = conflicts.filter((x) => x.decision === "recused").length;
  const pending = conflicts.filter((x) => x.decision === "pending" || x.decision === null).length;
  const totalMembers = Number(bodyRow?.member_count ?? 0);
  const quorum = calculateQuorum({
    formula: String(rule?.quorum_formula ?? bodyRow?.quorum_formula ?? "majority"),
    totalMembers,
    actualAttendees,
    recusedCount: recused,
    pendingCount: pending,
  });
  const id = uuid();
  const at = nowIso();
  await db.run(
    `INSERT INTO eligibility_snapshots (id, agenda_id, as_of, rule_version_id, calculation_inputs, total_members, actual_attendees, recused_count, pending_count, eligible_count, required_quorum, meets_quorum, computed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    String(agenda.id),
    at,
    rule ? String(rule.id) : null,
    JSON.stringify(quorum.calculationInputs),
    totalMembers,
    actualAttendees,
    recused,
    pending,
    quorum.eligibleCount,
    quorum.requiredQuorum,
    quorum.meetsQuorum ? 1 : 0,
    String(agenda.owner_user_id),
    at,
  );
  return {
    id,
    agendaId: String(agenda.id),
    asOf: at,
    totalMembers,
    actualAttendees,
    recusedCount: recused,
    pendingCount: pending,
    eligibleCount: quorum.eligibleCount,
    requiredQuorum: quorum.requiredQuorum,
    meetsQuorum: quorum.meetsQuorum,
    calculationInputs: quorum.calculationInputs,
    formula: String(rule?.quorum_formula ?? "majority"),
  };
}

async function effectiveControls(db: Db, agendaId: string, userId: string): Promise<CoiControls> {
  const row = await db.first<Record<string, unknown>>(
    `SELECT d.controls, d.decision FROM conflict_declarations cd
     JOIN conflict_determinations d ON d.id = (SELECT id FROM conflict_determinations WHERE conflict_id = cd.id ORDER BY determined_at DESC LIMIT 1)
     WHERE cd.agenda_id = ? AND cd.user_id = ?`,
    agendaId,
    userId,
  );
  if (!row) return parseControls(null);
  return parseControls(String(row.controls ?? null));
}

async function loadAgendaDetail(db: Db, id: string): Promise<Record<string, unknown>> {
  const row = await db.first<Record<string, unknown>>(
    "SELECT a.*, b.name AS body_name, u.name AS owner_name FROM agenda_items a JOIN bodies b ON b.id = a.body_id JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?",
    id,
  );
  if (!row) throw new AppError("NOT_FOUND", "対象が見つかりません", 404);
  const [packages, conflicts, opinions, eligibility, votes, decision, actions, aiDrafts] = await Promise.all([
    db.all("SELECT * FROM deliberation_packages WHERE agenda_id = ? ORDER BY version", id),
    db.all(
      `SELECT cd.*, d.decision, d.controls, d.reason AS determination_reason, d.determined_at, u.name AS user_name FROM conflict_declarations cd
       LEFT JOIN conflict_determinations d ON d.id = (SELECT id FROM conflict_determinations WHERE conflict_id = cd.id ORDER BY determined_at DESC LIMIT 1)
       JOIN users u ON u.id = cd.user_id WHERE cd.agenda_id = ?`,
      id,
    ),
    db.all("SELECT o.*, u.name AS user_name FROM opinions o JOIN users u ON u.id = o.user_id WHERE o.agenda_id = ? ORDER BY o.created_at", id),
    db.first("SELECT * FROM eligibility_snapshots WHERE agenda_id = ? ORDER BY created_at DESC LIMIT 1", id),
    db.all("SELECT v.*, u.name AS user_name FROM individual_votes v JOIN users u ON u.id = v.user_id WHERE v.agenda_id = ?", id),
    db.first("SELECT * FROM decisions WHERE agenda_id = ? ORDER BY decided_at DESC LIMIT 1", id),
    db.all("SELECT * FROM actions WHERE agenda_id = ? ORDER BY created_at", id),
    db.all("SELECT * FROM ai_drafts WHERE agenda_id = ? ORDER BY created_at", id),
  ]);
  const packagesWithItems = [];
  for (const p of packages) {
    const items = await db.all("SELECT * FROM deliberation_package_items WHERE package_id = ?", String(p.id));
    packagesWithItems.push({ ...p, items });
  }
  const actionsWithEvents = [];
  for (const a of actions) {
    const events = await db.all("SELECT * FROM action_events WHERE action_id = ? ORDER BY at", String(a.id));
    actionsWithEvents.push({ ...a, events });
  }
  return { ...row, packages: packagesWithItems, conflicts, opinions, eligibility, votes, decision, actions: actionsWithEvents, aiDrafts };
}

function canSeeBody(user: { role: string; bodyIds: string[] }, bodyId: string): boolean {
  const globalRoles = ["secretariat", "admin", "legal", "records", "kansa_yaku", "internal_audit_manager", "internal_auditor", "audit_log_viewer"];
  return globalRoles.includes(user.role) || user.bodyIds.includes(bodyId);
}
