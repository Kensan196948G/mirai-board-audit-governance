import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Button, Card, ErrorBox, Field, Spinner, StatusBadge, formatDate } from "../components/ui";
import { navigate } from "../router";
import type { AgendaItem } from "../types";

export function AgendaItems() {
  const { permissions } = useAuth();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    api<{ items: AgendaItem[] }>(`/agenda-items?${params.toString()}`).then((r) => setItems(r.items)).catch(setError);
  };
  useEffect(load, [q, status]);

  return (
    <>
      <Card title="議案一覧">
        <div className="filter-row">
          <Field label="検索">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="件名・概要" />
          </Field>
          <Field label="状態">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">すべて</option>
              {["created", "submitted", "returned", "withdrawn", "in_review", "decision_pending", "finalized", "closed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          {can(permissions, "agenda:create") ? (
            <Button onClick={() => navigate("/agenda-items?new=1")}>議案を新規作成</Button>
          ) : null}
        </div>
        {error ? <ErrorBox error={error} /> : null}
        {!items.length && !error ? <Spinner /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>件名</th>
                <th>種別</th>
                <th>機密</th>
                <th>会議体</th>
                <th>主管</th>
                <th>期限</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.urgent ? "🔺 " : ""}{String(a.title)}</td>
                  <td>{String(a.type ?? "")}</td>
                  <td>{String(a.classification ?? "")}</td>
                  <td>{String(a.body_name ?? "")}</td>
                  <td>{String(a.owner_name ?? "")}</td>
                  <td>{formatDate(String(a.due_at ?? ""))}</td>
                  <td><StatusBadge status={String(a.status)} /></td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/agenda-items/${a.id}`)}>
                      詳細
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
