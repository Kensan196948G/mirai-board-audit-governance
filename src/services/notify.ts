import type { Db } from "../db/types.ts";
import { nowIso, uuid } from "../ids.ts";

export async function notifyUser(
  db: Db,
  recipientId: string,
  title: string,
  body: string,
  kind: string,
  refType?: string,
  refId?: string,
): Promise<void> {
  const at = nowIso();
  await db.run(
    "INSERT INTO notifications (id, recipient_id, title, body, kind, ref_type, ref_id, status, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)",
    uuid(),
    recipientId,
    title,
    body,
    kind,
    refType ?? null,
    refId ?? null,
    at,
    at,
  );
}
