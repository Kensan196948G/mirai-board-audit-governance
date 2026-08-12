import type { Db } from "./db/types.ts";
import { nowIso, sha256Hex } from "./ids.ts";

export type ManifestContent = {
  manifestId: string;
  subjectType: string;
  subjectId: string;
  packageId?: string;
  fixedAt: string;
  fixedBy: string;
  ruleVersionId?: string;
  eligibilitySnapshotId?: string;
  votes: Array<Record<string, unknown>>;
  tally: Record<string, unknown>;
  outcome: string;
  conditions?: string | null;
  dissent?: string | null;
  note?: string | null;
  auditEventId?: string;
  previousManifestId?: string | null;
};

export async function sealManifest(
  db: Db,
  input: Omit<ManifestContent, "manifestId" | "fixedAt"> & { manifestId?: string; fixedAt?: string },
): Promise<{ id: string; sha256Full: string; content: ManifestContent }> {
  const fixedAt = input.fixedAt ?? nowIso();
  const manifestId = input.manifestId ?? `MAN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}-v1`;
  const content: ManifestContent = {
    manifestId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    packageId: input.packageId,
    fixedAt,
    fixedBy: input.fixedBy,
    ruleVersionId: input.ruleVersionId,
    eligibilitySnapshotId: input.eligibilitySnapshotId,
    votes: input.votes,
    tally: input.tally,
    outcome: input.outcome,
    conditions: input.conditions,
    dissent: input.dissent,
    auditEventId: input.auditEventId,
    previousManifestId: input.previousManifestId,
  };
  const sha256Full = await sha256Hex(JSON.stringify(content));
  await db.run(
    `INSERT INTO evidence_manifests (id, subject_type, subject_id, package_id, content, sha256_full, fixed_at, fixed_by, previous_manifest_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sealed')`,
    manifestId,
    content.subjectType,
    content.subjectId,
    content.packageId ?? null,
    JSON.stringify(content),
    sha256Full,
    fixedAt,
    content.fixedBy,
    content.previousManifestId ?? null,
  );
  return { id: manifestId, sha256Full, content };
}

export async function verifyManifest(db: Db, manifestId: string): Promise<{ valid: boolean; recomputed: string; stored: string }> {
  const row = await db.first<{ content: string; sha256_full: string }>("SELECT content, sha256_full FROM evidence_manifests WHERE id = ?", manifestId);
  if (!row) throw new Error("manifest not found");
  const recomputed = await sha256Hex(row.content);
  return { valid: recomputed === row.sha256_full, recomputed, stored: row.sha256_full };
}

export async function nextManifestId(db: Db, prefix = "MAN"): Promise<string> {
  const row = await db.first<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM evidence_manifests");
  return `${prefix}-${new Date().getFullYear()}-${String((row?.cnt ?? 0) + 1).padStart(4, "0")}-v1`;
}
