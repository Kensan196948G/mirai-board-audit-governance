import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";
import type { User } from "../types";
import { ErrorBox } from "../components/ui";

export function Login() {
  const { login } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: User[] }>("/users", { token: null }).then((r) => setUsers(r.items)).catch(setError);
  }, []);

  const select = async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(userId);
      navigate("/");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand brand-center">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>みらい取締役会・監査統合基盤</strong>
            <small>Mirai Board &amp; Audit Governance Hub — MVP デモ</small>
          </div>
        </div>
        <h1 id="login-title">デモユーザーを選択してログイン</h1>
        <p className="muted">すべて架空のデモデータです。本番認証（SSO/MFA）は対象外です。</p>
        {error ? <ErrorBox error={error} /> : null}
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <button type="button" className="user-row" onClick={() => select(u.id)} disabled={busy}>
                <span className="avatar" aria-hidden="true">
                  {u.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.title}（{u.department}）
                  </small>
                </span>
                <span className="badge badge-blue">{u.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
