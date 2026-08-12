import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, ErrorBox, Field, Spinner, StatusBadge, formatDate } from "../components/ui";

export function Retention() {
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [holds, setHolds] = useState<Array<Record<string, unknown>>>([]);
  const [disposals, setDisposals] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<unknown>(null);
  const [holdReason, setHoldReason] = useState("");

  const load = () => {
    Promise.all([
      api<{ items: Array<Record<string, unknown>> }>("/retention-rules"),
      api<{ items: Array<Record<string, unknown>> }>("/legal-holds"),
      api<{ items: Array<Record<string, unknown>> }>("/disposals"),
    ])
      .then(([r, h, d]) => {
        setRules(r.items);
        setHolds(h.items);
        setDisposals(d.items);
      })
      .catch(setError);
  };
  useEffect(load, []);

  const act = async (path: string, body: Record<string, unknown> = {}) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      load();
    } catch (e) {
      setError(e);
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!rules.length) return <Spinner />;

  return (
    <>
      <div className="grid-2">
        <Card title="保持ルール">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>記録種別</th>
                  <th>起算</th>
                  <th>年数</th>
                  <th>版</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={String(r.id)}>
                    <td>{String(r.record_type)}</td>
                    <td>{String(r.trigger)}</td>
                    <td>{String(r.years)}年</td>
                    <td>v{String(r.version)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              act("/legal-holds", { scopeType: "minutes", scopeId: "mtg-002", reason: holdReason || "株主総会関連の証拠保全（デモ）" });
              setHoldReason("");
            }}
          >
            <Field label="法的保全の理由"><input value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="例: 訴訟対応" /></Field>
            <Button type="submit">法的保全を開始</Button>
          </form>
        </Card>
        <Card title="法的保全">
          {holds.map((h) => (
            <div key={String(h.id)} className="action-row">
              <div>
                <strong>{String(h.scope_type)}:{String(h.scope_id)}</strong>
                <p className="muted small">{String(h.reason)} ／ 開始: {formatDate(String(h.started_at))}</p>
              </div>
              <StatusBadge status={String(h.status)} />
              {String(h.status) === "active" ? (
                <Button kind="ghost" onClick={() => act(`/legal-holds/${String(h.id)}/release`, { reason: "デモ解除" })}>解除</Button>
              ) : null}
            </div>
          ))}
        </Card>
      </div>
      <Card title="廃棄候補">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>記録</th>
                <th>満了日</th>
                <th>状態</th>
                <th>申請者</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {disposals.map((d) => (
                <tr key={String(d.id)}>
                  <td>{String(d.record_type)}:{String(d.record_id)}</td>
                  <td>{formatDate(String(d.expires_at))}</td>
                  <td><StatusBadge status={String(d.status)} /></td>
                  <td>{String(d.requested_by ?? "—")}</td>
                  <td>
                    {String(d.status) === "candidate" ? (
                      <Button kind="ghost" onClick={() => act(`/disposals/${String(d.id)}/request`)}>廃棄申請</Button>
                    ) : null}
                    {String(d.status) === "pending_approval" ? (
                      <Button kind="ghost" onClick={() => act(`/disposals/${String(d.id)}/approve`)}>承認</Button>
                    ) : null}
                    {String(d.status) === "approved" ? (
                      <Button kind="ghost" onClick={() => act(`/disposals/${String(d.id)}/execute`)}>実行</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">法的保全中（active）の記録は廃棄実行時に409で拒否されます。</p>
      </Card>
    </>
  );
}
