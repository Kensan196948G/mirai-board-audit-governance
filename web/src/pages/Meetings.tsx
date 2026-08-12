import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, ErrorBox, Spinner, StatusBadge, formatDate } from "../components/ui";
import { navigate } from "../router";
import type { Meeting } from "../types";

export function Meetings() {
  const [items, setItems] = useState<Meeting[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ items: Meeting[] }>("/meetings").then((r) => setItems(r.items)).catch(setError);
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!items.length) return <Spinner />;

  return (
    <Card title="会議一覧">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>会議名</th>
              <th>会議体</th>
              <th>開催日時</th>
              <th>方法</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td>{String(m.title)}</td>
                <td>{String(m.body_name ?? "")}</td>
                <td>{formatDate(String(m.held_at))}</td>
                <td>{String(m.method ?? "")}</td>
                <td><StatusBadge status={String(m.status)} /></td>
                <td>
                  <button type="button" className="btn btn-ghost" onClick={() => navigate(`/meetings/${m.id}`)}>
                    詳細
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
