import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Badge, Button, Card, ErrorBox, Field, Spinner, StatusBadge, formatDate } from "../components/ui";
import { navigate } from "../router";

type Detail = Record<string, unknown> & {
  id: string;
  status: string;
  packages: Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }>;
  conflicts: Array<Record<string, unknown>>;
  opinions: Array<Record<string, unknown>>;
  eligibility: Record<string, unknown> | null;
  votes: Array<Record<string, unknown>>;
  decision: Record<string, unknown> | null;
  actions: Array<Record<string, unknown> & { events: Array<Record<string, unknown>> }>;
  aiDrafts: Array<Record<string, unknown>>;
};

export function AgendaDetail({ id, newMode }: { id: string; newMode: boolean }) {
  const { permissions, user } = useAuth();
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [aiError, setAiError] = useState<unknown>(null);

  const load = () => {
    api<{ item: Detail }>(`/agenda-items/${id}`).then((r) => setItem(r.item)).catch(setError);
  };
  useEffect(() => {
    if (!newMode) load();
  }, [id, newMode]);

  const act = async (path: string, body: Record<string, unknown> = {}) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      setError(null);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const createNew = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await api<{ item: { id: string } }>("/agenda-items", {
        method: "POST",
        body: JSON.stringify({
          bodyId: form.bodyId || "body-board",
          type: form.type || "経営方針",
          classification: form.classification || "内部",
          title: form.title,
          summary: form.summary ?? "",
          ownerUserId: form.ownerUserId ?? user?.id,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
          urgent: form.urgent === "1",
        }),
      });
      navigate(`/agenda-items/${res.item.id}`);
    } catch (e) {
      setError(e);
    }
  };

  if (newMode) {
    return (
      <Card title="議案を新規作成">
        {error ? <ErrorBox error={error} /> : null}
        <form className="form-grid" onSubmit={createNew}>
          <Field label="件名（必須）"><input required value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="種別"><input value={form.type ?? ""} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="経営方針" /></Field>
          <Field label="機密区分"><select value={form.classification ?? ""} onChange={(e) => setForm({ ...form, classification: e.target.value })}><option value="内部">内部</option><option value="秘">秘</option><option value="極秘">極秘</option></select></Field>
          <Field label="会議体"><select value={form.bodyId ?? ""} onChange={(e) => setForm({ ...form, bodyId: e.target.value })}><option value="body-board">取締役会</option><option value="body-audit-supervisory">監査役会</option></select></Field>
          <Field label="概要"><textarea rows={3} value={form.summary ?? ""} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
          <Field label="期限"><input type="date" value={form.dueAt ?? ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field>
          <label className="field checkbox"><input type="checkbox" checked={form.urgent === "1"} onChange={(e) => setForm({ ...form, urgent: e.target.checked ? "1" : "0" })} /> 緊急上程</label>
          <div className="actions-row"><Button type="submit">作成</Button><Button kind="ghost" onClick={() => navigate("/agenda-items")}>キャンセル</Button></div>
        </form>
      </Card>
    );
  }

  if (error) return <ErrorBox error={error} />;
  if (!item) return <Spinner />;

  const decision = item.decision;
  const packageLatest = item.packages[item.packages.length - 1];
  const votes = item.votes;
  const tally = decision ? JSON.parse(String(decision.tally ?? "{}")) : null;

  return (
    <>
      <div className="page-head">
        <h2>{String(item.title)}</h2>
        <StatusBadge status={String(item.status)} />
      </div>
      <p className="muted">
        {String(item.body_name ?? "")} ／ {String(item.type ?? "")} ／ 機密区分: {String(item.classification ?? "")} ／ 主管: {String(item.owner_name ?? "")}
      </p>
      <p>{String(item.summary ?? "")}</p>

      <div className="grid-2">
        <Card title="状態遷移">
          {can(permissions, "agenda:submit") && ["created", "returned"].includes(item.status) ? (
            <Button onClick={() => act(`/agenda-items/${id}/submit`, { reason: "提出" })}>提出</Button>
          ) : null}
          {can(permissions, "agenda:resubmit") && item.status === "returned" ? (
            <Button onClick={() => act(`/agenda-items/${id}/resubmit`, { reason: "再提出" })}>再上程</Button>
          ) : null}
          {can(permissions, "agenda:return") && ["submitted", "in_review"].includes(item.status) ? (
            <Button kind="ghost" onClick={() => act(`/agenda-items/${id}/return`, { reason: "差戻し" })}>差戻し</Button>
          ) : null}
          {can(permissions, "agenda:withdraw") && ["created", "submitted", "in_review", "decision_pending"].includes(item.status) ? (
            <Button kind="danger" onClick={() => act(`/agenda-items/${id}/withdraw`, { reason: "取下げ" })}>取下げ</Button>
          ) : null}
        </Card>

        <Card title="利益相反・議決資格">
          <h3>申告・判定</h3>
          <ul className="link-list">
            {item.conflicts.map((c) => (
              <li key={String(c.id)}>
                {String(c.user_name ?? "")}: {String(c.decision ?? "未判定")}（{String(c.reason ?? "")}）
              </li>
            ))}
          </ul>
          {can(permissions, "conflict:declare") ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = (e.currentTarget.elements.namedItem("reason") as HTMLInputElement).value;
                act(`/agenda-items/${id}/conflicts`, { userId: user?.id, reason });
                e.currentTarget.reset();
              }}
            >
              <Field label="利益相反申告（理由）"><input name="reason" placeholder="取引関係の有無など" /></Field>
              <Button type="submit">申告する</Button>
            </form>
          ) : null}
          {can(permissions, "conflict:determine") ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const conflictId = (e.currentTarget.elements.namedItem("conflictId") as HTMLSelectElement).value;
                const decision = (e.currentTarget.elements.namedItem("decision") as HTMLSelectElement).value;
                act(`/conflicts/${conflictId}/determinations`, { determinerId: user?.id, decision });
              }}
            >
              <Field label="判定対象">
                <select name="conflictId">
                  {item.conflicts.filter((c) => !c.decision).map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.user_name ?? "")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="判定">
                <select name="decision">
                  <option value="eligible">資格あり</option>
                  <option value="recused">忌避（全操作遮断）</option>
                  <option value="pending">保留</option>
                </select>
              </Field>
              <Button type="submit">判定を登録</Button>
            </form>
          ) : null}
          <h3>資格・定足数</h3>
          {item.eligibility ? (
            <p className="small">
              在任 {String(item.eligibility.total_members)} 名 ／ 出席 {String(item.eligibility.actual_attendees)} 名 ／ 忌避除外 {String(item.eligibility.recused_count)} 名 ／ 保留 {String(item.eligibility.pending_count)} 名 ／ 必要 {String(item.eligibility.required_quorum)} 名 ／{" "}
              <Badge tone={item.eligibility.meets_quorum === 1 ? "green" : "red"}>{item.eligibility.meets_quorum === 1 ? "定足数充足" : "定足数不足"}</Badge>
            </p>
          ) : (
            <p className="muted">未計算</p>
          )}
          {can(permissions, "eligibility:view") ? (
            <Button kind="ghost" onClick={() => act(`/agenda-items/${id}/eligibility`)}>
              再計算
            </Button>
          ) : null}
        </Card>
      </div>

      <Card title="審議資料パッケージ">
        {packageLatest ? (
          <>
            <p className="small">
              版 {String(packageLatest.version)} ／ 固定: {formatDate(String(packageLatest.fixed_at))} ／ {String(packageLatest.verification_result ?? "")}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>資料</th>
                    <th>正本ID</th>
                    <th>版</th>
                    <th>引用位置</th>
                    <th>SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {packageLatest.items.map((it) => (
                    <tr key={String(it.id)}>
                      <td>{String(it.title)}</td>
                      <td>{String(it.source_id)}</td>
                      <td>{String(it.source_version)}</td>
                      <td>{String(it.citation_locator ?? "")}</td>
                      <td><code className="hash">{String(it.sha256_full).slice(0, 16)}…</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">未固定</p>
        )}
        {can(permissions, "package:fix") ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const title = (e.currentTarget.elements.namedItem("title") as HTMLInputElement).value;
              const sourceId = (e.currentTarget.elements.namedItem("sourceId") as HTMLInputElement).value;
              const excerpt = (e.currentTarget.elements.namedItem("excerpt") as HTMLTextAreaElement).value;
              void act(`/agenda-items/${id}/deliberation-packages`, {
                items: [{ title, sourceType: "doc", sourceId, sourceVersion: "v1", uri: null, sha256Full: "0".repeat(64), citationLocator: "全頁", classification: "秘", contentExcerpt: excerpt }],
              });
              e.currentTarget.reset();
            }}
          >
            <div className="form-grid">
              <Field label="資料名"><input name="title" required placeholder="資料名（デモ）" /></Field>
              <Field label="正本ID"><input name="sourceId" required placeholder="DOC-XXX-0000" /></Field>
              <Field label="本文抜粋（AI出典用）"><textarea name="excerpt" rows={2} /></Field>
            </div>
            <Button type="submit">資料パッケージを固定</Button>
          </form>
        ) : null}
      </Card>

      <Card title="正式議決">
        <p className="muted">事前意見と正式議決は分離されています。議決は会議開催中・議決資格のある本人のみ可能です。</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>氏名</th>
                <th>選択</th>
                <th>条件・理由</th>
                <th>時刻</th>
              </tr>
            </thead>
            <tbody>
              {votes.map((v) => (
                <tr key={String(v.id)}>
                  <td>{String(v.user_name ?? "")}</td>
                  <td><StatusBadge status={String(v.option)} /></td>
                  <td className="small">{String(v.conditions ?? v.reason ?? "")}</td>
                  <td>{formatDate(String(v.cast_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can(permissions, "vote:cast") && ["in_review", "decision_pending"].includes(item.status) ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const option = (e.currentTarget.elements.namedItem("option") as HTMLSelectElement).value;
              const conditions = (e.currentTarget.elements.namedItem("conditions") as HTMLInputElement).value;
              act(`/agenda-items/${id}/votes`, { userId: user?.id, option, conditions });
            }}
          >
            <Field label="議決">
              <select name="option">
                <option value="approve">賛成</option>
                <option value="approve_with_condition">条件付賛成</option>
                <option value="oppose">反対</option>
                <option value="abstain">棄権</option>
              </select>
            </Field>
            <Field label="条件・理由"><input name="conditions" /></Field>
            <Button type="submit">議決する</Button>
          </form>
        ) : null}
        {can(permissions, "decision:finalize") && ["in_review", "decision_pending"].includes(item.status) ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const outcome = (e.currentTarget.elements.namedItem("outcome") as HTMLSelectElement).value;
              const conditions = (e.currentTarget.elements.namedItem("dconditions") as HTMLInputElement).value;
              const dissent = (e.currentTarget.elements.namedItem("dissent") as HTMLInputElement).value;
              act(`/agenda-items/${id}/decisions`, { outcome, conditions, dissent });
            }}
          >
            <Field label="決議結果">
              <select name="outcome">
                <option value="passed">可決</option>
                <option value="rejected">否決</option>
                <option value="inconclusive">決議不成立</option>
              </select>
            </Field>
            <Field label="条件"><input name="dconditions" /></Field>
            <Field label="反対意見"><input name="dissent" /></Field>
            <Button type="submit">決議を確定（Evidence Manifest封緘）</Button>
          </form>
        ) : null}
        {decision ? (
          <div className="manifest-box">
            <h3>決議結果</h3>
            <p className="small">
              {String(decision.outcome)} ／ 成立: {formatDate(String(decision.decided_at))} ／ 集計: {tally ? `${tally.approve}賛成・${tally.oppose}反対・${tally.abstain}棄権` : "—"}
            </p>
            {String(decision.evidence_manifest_id ?? "") ? (
              <p>
                <a href={`#/evidence/${String(decision.evidence_manifest_id)}`}>Evidence Manifest: {String(decision.evidence_manifest_id)}</a>
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card title="履行タスク">
        {item.actions.length === 0 ? <p className="muted">なし</p> : null}
        {item.actions.map((a) => (
          <div key={String(a.id)} className="action-row">
            <div>
              <strong>{String(a.title)}</strong>
              <p className="muted small">担当: {String(a.owner_user_id)} ／ 期限: {formatDate(String(a.due_at))}</p>
              {a.events.map((ev) => (
                <p key={String(ev.id)} className="small">
                  {String(ev.event_type)}: {String(ev.note ?? "")}
                </p>
              ))}
            </div>
            <StatusBadge status={String(a.status)} />
            {user?.id === String(a.owner_user_id) || can(permissions, "action:confirm") ? (
              <select
                aria-label="履行タスク状態"
                value={String(a.status)}
                onChange={(e) => act(`/actions/${String(a.id)}/events`, { eventType: e.target.value, note: "デモ更新" })}
              >
                <option value="started">開始</option>
                <option value="evidence_submitted">証憑提出</option>
                <option value="completed">完了確認</option>
                <option value="returned">差戻し</option>
                <option value="reopened">再オープン</option>
              </select>
            ) : null}
          </div>
        ))}
        {decision && can(permissions, "action:manage") ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const title = (e.currentTarget.elements.namedItem("atitle") as HTMLInputElement).value;
              const dueAt = (e.currentTarget.elements.namedItem("adue") as HTMLInputElement).value;
              void act(`/decisions/${String(decision.id)}/actions`, {
                actions: [{ title, description: "デモ", ownerUserId: user?.id, confirmerUserId: "user-auditor-1", dueAt: dueAt ? new Date(dueAt).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(), acceptanceCriteria: "証拠と確認者レビュー" }],
              });
              e.currentTarget.reset();
            }}
          >
            <div className="form-grid">
              <Field label="タスク名"><input name="atitle" required /></Field>
              <Field label="期限"><input type="date" name="adue" /></Field>
            </div>
            <Button type="submit">履行タスクを生成</Button>
          </form>
        ) : null}
      </Card>

      <Card title="AI草案（デモ）">
        <p className="muted">規則ベースのデモ実装です。出典（審議資料パッケージ）がないと生成できません（422）。</p>
        {aiError ? <ErrorBox error={aiError} /> : null}
        {can(permissions, "ai:use") ? (
          <div className="stack">
            <Button
              onClick={async () => {
                try {
                  await api("/ai/drafts", { method: "POST", body: JSON.stringify({ agendaItemId: id, notes: "デモ" }) });
                  load();
                  setAiError(null);
                } catch (e) {
                  setAiError(e);
                }
              }}
            >
              草案を生成
            </Button>
          </div>
        ) : null}
        {item.aiDrafts.map((d) => (
          <div key={String(d.id)} className="ai-draft">
            <pre className="preview">{String(d.body)}</pre>
            <p className="small">
              状態: <StatusBadge status={String(d.status)} /> ／ 出典 {JSON.parse(String(d.citations ?? "[]")).length}件
            </p>
            <div className="actions-row">
              {can(permissions, "ai:use") && String(d.status) === "draft" && user?.id !== String(d.created_by) ? (
                <Button kind="ghost" onClick={() => act(`/ai/drafts/${String(d.id)}/review`, { approved: true })}>レビュー承認</Button>
              ) : null}
              {can(permissions, "ai:use") && String(d.status) === "reviewed" ? (
                <Button kind="ghost" onClick={() => act(`/ai/drafts/${String(d.id)}/save`)}>保存</Button>
              ) : null}
              {can(permissions, "ai:use") && String(d.status) === "saved" ? (
                <Button kind="ghost" onClick={() => act(`/ai/drafts/${String(d.id)}/share`)}>共有</Button>
              ) : null}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
