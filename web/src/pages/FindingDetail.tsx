import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Button, Card, ErrorBox, Field, Spinner, StatusBadge, formatDate } from "../components/ui";

type Detail = Record<string, unknown> & {
  responses: Array<Record<string, unknown>>;
  acceptances: Array<Record<string, unknown>>;
  remediations: Array<Record<string, unknown>>;
  retests: Array<Record<string, unknown>>;
};

export function FindingDetail({ id }: { id: string }) {
  const { permissions, user } = useAuth();
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = () => {
    api<{ item: Detail }>(`/findings/${id}`).then((r) => setItem(r.item)).catch(setError);
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
      <p className="muted">重要度: {String(item.severity)} ／ 監査: {String(item.engagement_title ?? "")}</p>
      <Card title="指摘内容">
        <p><strong>基準:</strong> {String(item.criterion)}</p>
        <p><strong>事実:</strong> {String(item.fact)}</p>
        <p><strong>原因:</strong> {String(item.cause ?? "")}</p>
        <p><strong>影響:</strong> {String(item.impact ?? "")}</p>
        <p><strong>勧告:</strong> {String(item.recommendation ?? "")}</p>
      </Card>

      {can(permissions, "finding:finalize") && String(item.status) === "draft" ? (
        <div className="actions-row">
          <Button onClick={() => act(`/findings/${id}/finalize`)}>指摘を確定</Button>
        </div>
      ) : null}

      {can(permissions, "finding:respond") && ["finalized", "awaiting_response"].includes(String(item.status)) ? (
        <Card title="経営回答・是正">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const responseText = (e.currentTarget.elements.namedItem("response") as HTMLTextAreaElement).value;
              const plan = (e.currentTarget.elements.namedItem("plan") as HTMLInputElement).value;
              act(`/findings/${id}/management-responses`, { agree: true, responseText, plan, dueAt: new Date(Date.now() + 30 * 86400000).toISOString() });
            }}
          >
            <Field label="回答"><textarea name="response" required rows={3} /></Field>
            <Field label="是正計画"><input name="plan" /></Field>
            <Button type="submit">経営回答を提出</Button>
          </form>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const description = (e.currentTarget.elements.namedItem("desc") as HTMLInputElement).value;
              act(`/findings/${id}/remediations`, { description, ownerId: user?.id });
            }}
          >
            <Field label="是正証憑"><input name="desc" required placeholder="証憑の説明（デモ）" /></Field>
            <Button type="submit">是正証憑を提出</Button>
          </form>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const authority = (e.currentTarget.elements.namedItem("authority") as HTMLInputElement).value;
              act(`/findings/${id}/risk-acceptances`, { acceptorId: user?.id, authority, rationale: "残余リスクを管理可能と判断（デモ）", expiryAt: new Date(Date.now() + 90 * 86400000).toISOString() });
            }}
          >
            <Field label="受容権限"><input name="authority" placeholder="取締役会決議など" /></Field>
            <Button kind="ghost" type="submit">残余リスク受容を申請</Button>
          </form>
        </Card>
      ) : null}

      {can(permissions, "finding:retest") && ["awaiting_response", "remediating", "reopened"].includes(String(item.status)) ? (
        <Card title="独立再検証">
          <div className="actions-row">
            <Button onClick={() => act(`/findings/${id}/retests`, { result: "closed", note: "是正証憑を確認し終結（デモ）" })}>再検証して終結</Button>
            <Button kind="danger" onClick={() => act(`/findings/${id}/retests`, { result: "reopened", note: "再発を確認し再オープン（デモ）" })}>再検証して再オープン</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid-2">
        <Card title="経営回答">
          {item.responses.map((r) => (
            <div key={String(r.id)} className="small">
              <p>{Number(r.agree) === 1 ? "同意" : "不同意"}: {String(r.response_text)}</p>
              <p className="muted">{String(r.plan ?? "")} ／ 期限 {formatDate(String(r.due_at ?? ""))}</p>
            </div>
          ))}
        </Card>
        <Card title="是正・再検証履歴">
          {item.remediations.map((r) => (
            <p key={String(r.id)} className="small">{String(r.description)}（{String(r.status)}）</p>
          ))}
          {item.retests.map((r) => (
            <p key={String(r.id)} className="small">
              再検証: <StatusBadge status={String(r.result)} /> {String(r.note ?? "")} ／ {formatDate(String(r.tested_at))}
            </p>
          ))}
        </Card>
      </div>
    </>
  );
}
