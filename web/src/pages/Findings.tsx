import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, ErrorBox, Spinner, StatusBadge, formatDate } from "../components/ui";
import { navigate } from "../router";
import type { Finding } from "../types";

export function Findings() {
  const [items, setItems] = useState<Finding[]>([]);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    api<{ items: Finding[] }>("/findings").then((r) => setItems(r.items)).catch(setError);
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!items.length) return <Spinner />;
  return (
    <Card title="指摘・是正">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>指摘</th>
              <th>重要度</th>
              <th>状態</th>
              <th>確定日時</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id}>
                <td>{String(f.title)}</td>
                <td><StatusBadge status={String(f.severity)} /></td>
                <td><StatusBadge status={String(f.status)} /></td>
                <td>{formatDate(String(f.finalized_at ?? ""))}</td>
                <td><button type="button" className="btn btn-ghost" onClick={() => navigate(`/findings/${f.id}`)}>詳細</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
