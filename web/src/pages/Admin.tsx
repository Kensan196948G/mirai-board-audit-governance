import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { Badge, Card, ErrorBox, Spinner, StatusBadge } from "../components/ui";
import type { User } from "../types";

type Req = { id: string; name: string; status: string; test?: string; note?: string; api?: string };

export function Admin() {
  const { permissions } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [sod, setSod] = useState<Array<Record<string, unknown>>>([]);
  const [reqs, setReqs] = useState<{ fr: Req[]; ac: Req[]; nfr: Req[] } | null>(null);
  const [auditAccess, setAuditAccess] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      api<{ items: User[] }>("/users"),
      can(permissions, "admin:sod") ? api<{ items: Array<Record<string, unknown>> }>("/admin/sod-conflicts") : Promise.resolve(null),
      can(permissions, "admin:requirements") ? api<{ fr: Req[]; ac: Req[]; nfr: Req[] }>("/admin/requirements") : Promise.resolve(null),
      can(permissions, "admin:audit-access") ? api<{ items: Array<Record<string, unknown>> }>("/admin/audit-log-access") : Promise.resolve(null),
    ])
      .then(([u, s, r, a]) => {
        setUsers(u.items);
        setSod(s?.items ?? []);
        setReqs(r);
        setAuditAccess(a?.items ?? []);
      })
      .catch(setError);
  }, [permissions]);

  if (error) return <ErrorBox error={error} />;
  if (!users.length) return <Spinner />;

  return (
    <>
      <div className="grid-2">
        <Card title="ユーザー・ロール">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>ロール</th>
                  <th>役職</th>
                  <th>社外</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td><Badge tone="blue">{u.role}</Badge></td>
                    <td className="small">{u.title}</td>
                    <td>{u.outside ? "社外" : "社内"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="職務分離の競合チェック">
          {sod.length === 0 ? <p className="muted">検出された競合はありません（作成者≠レビュー者の分離はサーバ側で強制）</p> : null}
          <ul className="link-list">
            {sod.map((s) => (
              <li key={`${String(s.type)}-${String(s.resource)}`}>
                <Badge tone="orange">{String(s.type)}</Badge> {String(s.detail)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="監査ログ閲覧権限者">
        <ul className="link-list">
          {auditAccess.map((a) => (
            <li key={String(a.id)}>
              {String(a.name)}（{String(a.role)}）
            </li>
          ))}
        </ul>
      </Card>
      {reqs ? (
        <Card title="要件対応表（FR / AC / NFR）">
          <h3>FR（機能要件）</h3>
          <RequirementTable rows={reqs.fr} />
          <h3>AC（受入基準）</h3>
          <RequirementTable rows={reqs.ac} />
          <h3>NFR（非機能要件）</h3>
          <RequirementTable rows={reqs.nfr} noteColumn />
        </Card>
      ) : null}
    </>
  );
}

function RequirementTable({ rows, noteColumn = false }: { rows: Req[]; noteColumn?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>要件</th>
            {!noteColumn ? <th>根拠API</th> : null}
            <th>状態</th>
            {!noteColumn ? <th>テスト</th> : <th>備考</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.name}</td>
              {!noteColumn ? <td className="small">{r.api ?? ""}</td> : null}
              <td><StatusBadge status={r.status} /></td>
              {!noteColumn ? <td className="small">{r.test ?? ""}</td> : <td className="small">{r.note ?? ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
