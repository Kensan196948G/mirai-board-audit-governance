import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Button, Card, ErrorBox, Field, Spinner, StatusBadge, formatDate } from "../components/ui";
import { navigate } from "../router";

type MeetingDetail = Record<string, unknown> & {
  id: string;
  status: string;
  convocations: Array<Record<string, unknown>>;
  attendanceEvents: Array<Record<string, unknown>>;
  agendaItems: Array<Record<string, unknown>>;
  minutes: Record<string, unknown> | null;
};

const TRANSITIONS: Record<string, string> = {
  prepared: "convened",
  convened: "in_progress",
  in_progress: "closed",
  closed: "minutes_review",
  minutes_review: "finalized",
};

export function MeetingDetail({ id }: { id: string }) {
  const { permissions } = useAuth();
  const [item, setItem] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  const load = () => {
    api<{ item: MeetingDetail }>(`/meetings/${id}`).then((r) => setItem(r.item)).catch(setError);
  };
  useEffect(load, [id]);

  const act = async (path: string, method: "POST", body: Record<string, unknown> = {}) => {
    try {
      await api(path, { method, body: JSON.stringify(body) });
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
      <p className="muted">
        会議体: {String(item.body_name ?? "")} ／ 開催: {formatDate(String(item.held_at))} ／ 議長: {String(item.chair_user_id ?? "未設定")}
      </p>
      <div className="grid-2">
        <Card title="招集・出欠">
          {item.convocations.length === 0 ? <p className="muted">招集なし</p> : null}
          {item.convocations.map((c) => (
            <p key={String(c.id)} className="small">
              招集 {formatDate(String(c.issued_at))}（回答期限 {formatDate(String(c.due_at))}）
            </p>
          ))}
          {can(permissions, "convocation:create") ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(`/meetings/${id}/convocations`, "POST", { dueAt: notice || new Date(Date.now() + 86400000).toISOString(), note: "デモ招集" });
              }}
            >
              <Field label="回答期限">
                <input type="datetime-local" value={notice} onChange={(e) => setNotice(e.target.value)} />
              </Field>
              <Button type="submit">招集通知を発出</Button>
            </form>
          ) : null}
          <h3>出欠イベント</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>種別</th>
                  <th>時刻</th>
                </tr>
              </thead>
              <tbody>
                {item.attendanceEvents.map((a) => (
                  <tr key={String(a.id)}>
                    <td>{String(a.user_name ?? "")}</td>
                    <td><StatusBadge status={String(a.event_type)} /></td>
                    <td>{formatDate(String(a.occurred_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="議案・議事録">
          <h3>議案</h3>
          <ul className="link-list">
            {item.agendaItems.map((a) => (
              <li key={String(a.id)}>
                <a href={`#/agenda-items/${String(a.id)}`}>
                  {String(a.title)} <StatusBadge status={String(a.status)} />
                </a>
              </li>
            ))}
          </ul>
          <h3>議事録</h3>
          {item.minutes ? (
            <>
              <p className="small">版 {String((item.minutes.versions as Array<Record<string, unknown>>)?.[0]?.version_no ?? 1)}（{String(item.minutes.status)}）</p>
              {(item.minutes.versions as Array<Record<string, unknown>>)?.map((v) => (
                <div key={String(v.id)} className="version-box">
                  <p className="small">v{String(v.version_no)} ／ 作成: {formatDate(String(v.created_at))}</p>
                  <pre className="preview">{String(v.content).slice(0, 300)}</pre>
                  {can(permissions, "minutes:sign") ? (
                    <Button kind="ghost" onClick={() => act(`/minutes/${String(v.id)}/signoffs`, "POST")}>
                      この版に記名
                    </Button>
                  ) : null}
                </div>
              ))}
            </>
          ) : (
            <p className="muted">議事録なし</p>
          )}
          {can(permissions, "minutes:create") ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const content = (e.currentTarget.elements.namedItem("content") as HTMLTextAreaElement).value;
                act(`/meetings/${id}/minutes/versions`, "POST", { content });
                e.currentTarget.reset();
              }}
            >
              <Field label="議事録案">
                <textarea name="content" required placeholder="議事録本文（デモ）" rows={4} />
              </Field>
              <Button type="submit">議事録案を作成</Button>
            </form>
          ) : null}
        </Card>
      </div>
      {can(permissions, "meeting:status") && TRANSITIONS[item.status] ? (
        <div className="actions-row">
          <Button onClick={() => act(`/meetings/${id}/status`, "POST", { status: TRANSITIONS[item.status] })}>
            {item.status === "prepared" ? "招集済みにする" : item.status === "convened" ? "会議を開始" : item.status === "in_progress" ? "会議を閉会" : "次の状態へ"}
          </Button>
          <Button kind="ghost" onClick={() => navigate("/meetings")}>
            一覧へ戻る
          </Button>
        </div>
      ) : null}
    </>
  );
}
