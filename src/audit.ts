import type { Db } from "./db/types.ts";
import { nowIso, sha256Hex, uuid } from "./ids.ts";

export type AuditEventInput = {
  actorId: string;
  delegatedBy?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  resourceVersion?: string;
  result?: string;
  reason?: string;
  correlationId?: string;
};

export async function writeAuditEvent(db: Db, input: AuditEventInput): Promise<string> {
  const op = await prepareAuditEvent(db, input);
  await db.run(op.sql, ...op.params);
  return op.id;
}

export async function prepareAuditEvent(db: Db, input: AuditEventInput): Promise<{ sql: string; params: Array<string | number | null>; id: string; seq: number }> {
  const last = await db.first<{ event_hash: string; seq: number }>("SELECT event_hash, seq FROM audit_events ORDER BY seq DESC LIMIT 1");
  const seq = (last?.seq ?? 0) + 1;
  const previousHash = last?.event_hash ?? "GENESIS";
  const occurredAt = nowIso();
  const id = uuid();
  const payload = JSON.stringify({
    seq,
    id,
    actorId: input.actorId,
    delegatedBy: input.delegatedBy ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    resourceVersion: input.resourceVersion ?? null,
    result: input.result ?? "ok",
    reason: input.reason ?? null,
    correlationId: input.correlationId ?? null,
    occurredAt,
    previousHash,
  });
  const eventHash = await sha256Hex(payload);
  return {
    sql:
    `INSERT INTO audit_events (id, seq, actor_id, delegated_by, action, resource_type, resource_id, resource_version, result, reason, correlation_id, occurred_at, timezone, previous_hash, event_hash, signature_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Asia/Tokyo', ?, ?, ?)`,
    params: [
      id,
      seq,
      input.actorId,
      input.delegatedBy ?? null,
      input.action,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.resourceVersion ?? null,
      input.result ?? "ok",
      input.reason ?? null,
      input.correlationId ?? null,
      occurredAt,
      previousHash,
      eventHash,
      "demo-hmac",
    ],
    id,
    seq,
  };
}

export async function verifyAuditChain(db: Db): Promise<{ valid: boolean; issues: string[]; count: number }> {
  const events = await db.all<{
    seq: number;
    previous_hash: string;
    event_hash: string;
    id: string;
    actor_id: string;
    delegated_by: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    resource_version: string | null;
    result: string;
    reason: string | null;
    correlation_id: string | null;
    occurred_at: string;
  }>(
    "SELECT seq, previous_hash, event_hash, id, actor_id, delegated_by, action, resource_type, resource_id, resource_version, result, reason, correlation_id, occurred_at FROM audit_events ORDER BY seq ASC",
  );
  const issues: string[] = [];
  let previousHash = "GENESIS";
  let expectedSeq = 1;
  for (const ev of events) {
    if (ev.seq !== expectedSeq) issues.push(`sequence gap: expected ${expectedSeq}, found ${ev.seq}`);
    if (ev.previous_hash !== previousHash) issues.push(`chain broken at seq ${ev.seq}: previous hash mismatch`);
    const payload = JSON.stringify({
      seq: ev.seq,
      id: ev.id,
      actorId: ev.actor_id,
      delegatedBy: ev.delegated_by,
      action: ev.action,
      resourceType: ev.resource_type,
      resourceId: ev.resource_id,
      resourceVersion: ev.resource_version,
      result: ev.result,
      reason: ev.reason,
      correlationId: ev.correlation_id,
      occurredAt: ev.occurred_at,
      previousHash: ev.previous_hash,
    });
    const recomputed = await sha256Hex(payload);
    if (recomputed !== ev.event_hash) issues.push(`hash mismatch at seq ${ev.seq}`);
    previousHash = ev.event_hash;
    expectedSeq += 1;
  }
  return { valid: issues.length === 0, issues, count: events.length };
}

/** 監査イベント一覧（検索） */
export async function listAuditEvents(
  db: Db,
  opts: { actor?: string; action?: string; resource?: string; from?: string; to?: string; limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (opts.actor) {
    where.push("actor_id = ?");
    params.push(opts.actor);
  }
  if (opts.action) {
    where.push("action = ?");
    params.push(opts.action);
  }
  if (opts.resource) {
    where.push("(resource_type = ? OR resource_id = ?)");
    params.push(opts.resource, opts.resource);
  }
  if (opts.from) {
    where.push("occurred_at >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    where.push("occurred_at <= ?");
    params.push(opts.to);
  }
  const limit = Math.min(opts.limit ?? 200, 500);
  const sql = `SELECT * FROM audit_events ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY seq DESC LIMIT ${limit}`;
  return db.all(sql, ...params);
}
