import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, ErrorBox, Field, Spinner, formatDate } from "../components/ui";

export function AuditLog() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [chain, setChain] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (actor) params.set("actor", actor);
    if (action) params.set("action", action);
    api<{ items: Array<Record<string, unknown>> }>(`/audit-events?${params.toString()}`).then((r) => setItems(r.items)).catch(setError);
  };
  useEffect(load, [actor, action]);

  const verifyChain = () => {
    api<Record<string, unknown>>("/audit-events/verify-chain").then(setChain).catch(setError);
  };
  useEffect(verifyChain, []);

  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <Card title="監査ログ（追記型チェーン）">
        <div className="filter-row">
          <Field label="主体"><input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="user-director-1" /></Field>
          <Field label="操作"><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="agenda.vote" /></Field>
          <Button kind="ghost" onClick={verifyChain}>チェーン全体を検証</Button>
        </div>
        {chain ? (
          <p className="small">
            チェーン検証: <Badge tone={chain.valid === true ? "green" : "red"}>{chain.valid === true ? `有効（${String(chain.count)}イベント）` : "欠損あり"}</Badge>
            {chain.valid !== true ? <span className="muted"> {JSON.stringify(chain.issues)}</span> : null}
          </p>
        ) : (
          <Spinner />
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>seq</th>
                <th>日時</th>
                <th>主体</th>
                <th>操作</th>
                <th>対象</th>
                <th>結果</th>
                <th>相関ID</th>
                <th>イベントハッシュ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={String(e.id)}>
                  <td>{String(e.seq)}</td>
                  <td>{formatDate(String(e.occurred_at))}</td>
                  <td>{String(e.actor_id ?? "")}</td>
                  <td>{String(e.action)}</td>
                  <td className="small">{String(e.resource_type ?? "")}:{String(e.resource_id ?? "")}</td>
                  <td>{String(e.result ?? "")}</td>
                  <td className="small">{String(e.correlation_id ?? "")}</td>
                  <td><code className="hash">{String(e.event_hash).slice(0, 12)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
