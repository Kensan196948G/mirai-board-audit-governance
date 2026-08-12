import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, ErrorBox, Spinner, StatusBadge, formatDate } from "../components/ui";
import type { Manifest } from "../types";

export function Evidence() {
  const [items, setItems] = useState<Manifest[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Manifest | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);

  const load = () => {
    api<{ items: Manifest[] }>("/manifests").then((r) => setItems(r.items)).catch(setError);
  };
  useEffect(load, []);

  const open = async (id: string) => {
    try {
      const res = await api<{ item: Manifest }>(`/manifests/${id}`);
      setSelected(res.item);
      setVerifyResult(null);
    } catch (e) {
      setError(e);
    }
  };

  const verify = async (id: string) => {
    try {
      const res = await api<{ item: Record<string, unknown> }>(`/manifests/${id}/verify`, { method: "POST", body: "{}" });
      setVerifyResult(res.item);
    } catch (e) {
      setError(e);
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!items.length) return <Spinner />;

  return (
    <div className="grid-2 wide">
      <Card title="Evidence Manifest 一覧">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>対象</th>
                <th>固定日時</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>{m.id}</td>
                  <td>{String(m.subject_type)}</td>
                  <td>{formatDate(String(m.fixed_at))}</td>
                  <td><StatusBadge status={String(m.status)} /></td>
                  <td><button type="button" className="btn btn-ghost" onClick={() => open(m.id)}>開く</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Manifest 詳細">
        {selected ? (
          <>
            <p className="small">
              <strong>{selected.id}</strong> ／ 対象: {String(selected.subject_type)} ({String(selected.subject_id)})
            </p>
            <pre className="preview">{JSON.stringify(selected.content ?? {}, null, 2).slice(0, 2500)}</pre>
            <div className="actions-row">
              <Button kind="ghost" onClick={() => verify(selected.id)}>ハッシュ再検証</Button>
              <a className="btn btn-ghost" href={`/api/evidence-packages/${selected.id}`} target="_blank" rel="noreferrer">
                証拠パッケージ（印刷用）
              </a>
            </div>
            {verifyResult ? (
              <p className="small">
                検証結果: <Badge tone={verifyResult.valid === true ? "green" : "red"}>{verifyResult.valid === true ? "一致（改変なし）" : "不一致"}</Badge>
                <br />
                SHA-256: <code className="hash">{String(verifyResult.recomputedSha256)}</code>
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted">左の一覧からManifestを選択してください</p>
        )}
      </Card>
    </div>
  );
}
