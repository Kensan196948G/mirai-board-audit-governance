import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Card, ErrorBox, StatusBadge, formatDate } from "../components/ui";
import { navigate } from "../router";
import type { Notification } from "../types";

export function MyTasks() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = () => {
    api<{ items: Notification[] }>("/users/me/notifications").then((r) => setItems(r.items)).catch(setError);
  };
  useEffect(load, []);

  const ack = async (id: string) => {
    try {
      await api(`/notifications/${id}/acknowledge`, { method: "POST", body: "{}" });
      load();
    } catch (e) {
      setError(e);
    }
  };

  if (error) return <ErrorBox error={error} />;

  return (
    <Card title="通知・依頼一覧">
      {items.length === 0 ? <p className="muted empty">通知はありません</p> : null}
      <ul className="task-list">
        {items.map((n) => (
          <li key={n.id} className={n.status === "unread" ? "unread" : ""}>
            <div>
              <strong>{n.title}</strong>
              <p className="muted small">{String(n.body ?? "")}</p>
              <p className="muted small">{formatDate(n.created_at)}</p>
            </div>
            <div className="row-actions">
              <StatusBadge status={String(n.status)} />
              {n.status === "unread" ? (
                <button type="button" className="btn btn-ghost" onClick={() => ack(n.id)}>
                  受領確認
                </button>
              ) : null}
              {n.ref_type === "action" ? (
                <button type="button" className="btn btn-ghost" onClick={() => navigate("/agenda-items")}>
                  詳細
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">
        受領・再送はアプリ内で記録されます（実メール送信はバックログ <Badge tone="gray">B-03</Badge>）。
      </p>
    </Card>
  );
}
