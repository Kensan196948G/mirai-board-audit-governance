import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Button, Card, ErrorBox, Field, StatusBadge } from "../components/ui";
import { navigate } from "../router";

export function Audit() {
  const { permissions } = useAuth();
  const [engagements, setEngagements] = useState<Array<Record<string, unknown>>>([]);
  const [universes, setUniverses] = useState<Array<Record<string, unknown>>>([]);
  const [risks, setRisks] = useState<Array<Record<string, unknown>>>([]);
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      can(permissions, "audit:engagement") ? api<{ items: Array<Record<string, unknown>> }>("/engagements") : Promise.resolve(null),
      can(permissions, "audit:universe") ? api<{ items: Array<Record<string, unknown>> }>("/audit-universes") : Promise.resolve(null),
      can(permissions, "audit:risk") ? api<{ items: Array<Record<string, unknown>> }>("/risk-assessments") : Promise.resolve(null),
      can(permissions, "audit:plan") ? api<{ items: Array<Record<string, unknown>> }>("/annual-plans") : Promise.resolve(null),
    ])
      .then(([e, u, r, p]) => {
        setEngagements(e?.items ?? []);
        setUniverses(u?.items ?? []);
        setRisks(r?.items ?? []);
        setPlans(p?.items ?? []);
      })
      .catch(setError);
  }, [permissions]);

  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <Card title="個別監査">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>監査名</th>
                <th>対象</th>
                <th>期間</th>
                <th>担当</th>
                <th>独立性</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr key={String(e.id)}>
                  <td>{String(e.title)}</td>
                  <td>{String(e.universe_name ?? e.scope ?? "")}</td>
                  <td>{String(e.start_on ?? "")}〜{String(e.end_on ?? "")}</td>
                  <td>{String(e.owner_name ?? "")}</td>
                  <td>{Number(e.independence_declared) === 1 ? "宣言済" : "未宣言"}</td>
                  <td><StatusBadge status={String(e.status)} /></td>
                  <td><button type="button" className="btn btn-ghost" onClick={() => navigate(`/audit/engagements/${String(e.id)}`)}>詳細</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can(permissions, "audit:engagement") ? (
          <CreateEngagement onCreated={() => location.reload()} />
        ) : null}
      </Card>
      <div className="grid-2">
        <Card title="監査ユニバース">
          <ul className="link-list">
            {universes.map((u) => (
              <li key={String(u.id)}>
                {String(u.name)} <span className="muted">（{String(u.category)}）</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="リスク評価・年度計画">
          <h3>リスク評価（2026年度）</h3>
          <ul className="link-list">
            {risks.map((r) => (
              <li key={String(r.id)}>
                {String(r.universe_name ?? "")}: スコア {String(r.score)}
              </li>
            ))}
          </ul>
          <h3>年度計画</h3>
          {plans.map((p) => (
            <p key={String(p.id)} className="small">
              {String(p.fiscal_year)}年度: {String(p.title)}（{String(p.status)}）
            </p>
          ))}
        </Card>
      </div>
    </>
  );
}

function CreateEngagement({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/engagements", { method: "POST", body: JSON.stringify({ title, scope, universeId: "uni-001", annualPlanId: "ap-2026", startOn: "2026-10-01", endOn: "2026-12-31" }) });
      onCreated();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="form-grid stack" onSubmit={submit}>
      {error ? <ErrorBox error={error} /> : null}
      <Field label="監査名"><input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="範囲"><input value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
      <Button type="submit">個別監査を作成</Button>
    </form>
  );
}
