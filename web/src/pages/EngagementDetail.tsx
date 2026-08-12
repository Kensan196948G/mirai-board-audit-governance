import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Button, Card, ErrorBox, Field, Spinner, StatusBadge } from "../components/ui";
import { navigate } from "../router";

type Detail = Record<string, unknown> & {
  procedures: Array<Record<string, unknown> & { workpapers: Array<Record<string, unknown>> }>;
  findings: Array<Record<string, unknown>>;
};

export function EngagementDetail({ id }: { id: string }) {
  const { permissions, user } = useAuth();
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = () => {
    api<{ item: Detail }>(`/engagements/${id}`).then((r) => setItem(r.item)).catch(setError);
  };
  useEffect(load, [id]);

  const act = async (path: string, body: Record<string, unknown> = {}) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      load();
    } catch (e) {
      setError(e);
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!item) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <h2>{String(item.title)}</h2>
        <StatusBadge status={String(item.status)} />
      </div>
      <p className="muted">{String(item.scope ?? "")}</p>

      {item.procedures.map((p) => (
        <Card key={String(p.id)} title={`手続: ${String(p.title)}`}>
          <p className="muted small">
            母集団 {String(p.population_count)} 件 ／ サンプル {String(p.sample_count)} 件 ／ 抽出根拠: {String(p.sampling_basis ?? "")}
          </p>
          {p.workpapers.map((w) => (
            <div key={String(w.id)} className="wp-box">
              <div className="row-between">
                <strong>{String(w.title)}</strong>
                <StatusBadge status={String(w.status)} />
              </div>
              <p className="muted small">
                作成: {String(w.author_name ?? "")} ／ レビュー: {String(w.reviewer_name ?? "未割当")} ／ v{String(w.version_no)}
              </p>
              {can(permissions, "workpaper:review") && user?.id !== String(w.author_id) && String(w.status) === "draft" ? (
                <Button kind="ghost" onClick={() => act(`/workpapers/${String(w.id)}/review-requests`)}>レビュー依頼</Button>
              ) : null}
            </div>
          ))}
          {can(permissions, "workpaper:create") ? (
            <CreateWorkpaper procedureId={String(p.id)} onCreated={load} />
          ) : null}
        </Card>
      ))}

      <Card title="指摘（本監査）">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>指摘</th>
                <th>重要度</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {item.findings.map((f) => (
                <tr key={String(f.id)}>
                  <td>{String(f.title)}</td>
                  <td><StatusBadge status={String(f.severity)} /></td>
                  <td><StatusBadge status={String(f.status)} /></td>
                  <td><button type="button" className="btn btn-ghost" onClick={() => navigate(`/findings/${String(f.id)}`)}>詳細</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can(permissions, "finding:create") ? (
          <CreateFinding engagementId={id} workpaperId={String(item.procedures[0]?.workpapers[0]?.id ?? "")} onCreated={load} />
        ) : null}
      </Card>
    </>
  );
}

function CreateWorkpaper({ procedureId, onCreated }: { procedureId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/procedures/${procedureId}/workpapers`, { method: "POST", body: JSON.stringify({ title, content, evidenceRefs: [] }) });
          onCreated();
          setTitle("");
          setContent("");
        } catch (err) {
          setError(err);
        }
      }}
    >
      {error ? <ErrorBox error={error} /> : null}
      <div className="form-grid">
        <Field label="調書名"><input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="内容"><textarea required rows={3} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      </div>
      <Button type="submit">調書を作成</Button>
    </form>
  );
}

function CreateFinding({ engagementId, workpaperId, onCreated }: { engagementId: string; workpaperId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [fact, setFact] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/findings", {
            method: "POST",
            body: JSON.stringify({ engagementId, workpaperId: workpaperId || undefined, title, criterion: "社内規程（デモ）", fact, cause: "デモ原因", impact: "デモ影響", recommendation: "デモ勧告", severity: "medium" }),
          });
          onCreated();
          setTitle("");
          setFact("");
        } catch (err) {
          setError(err);
        }
      }}
    >
      {error ? <ErrorBox error={error} /> : null}
      <div className="form-grid">
        <Field label="指摘名"><input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="事実"><textarea required rows={2} value={fact} onChange={(e) => setFact(e.target.value)} /></Field>
      </div>
      <Button type="submit">指摘案を作成</Button>
    </form>
  );
}
