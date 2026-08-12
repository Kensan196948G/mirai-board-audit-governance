import { useState, type ReactNode } from "react";
import { can, useAuth } from "./auth";
import { navigate } from "./router";

const NAV = [
  { path: "/", label: "ダッシュボード", perm: "dashboard:view" },
  { path: "/tasks", label: "マイタスク", perm: "notification:ack" },
  { path: "/meetings", label: "会議", perm: "meeting:view" },
  { path: "/agenda-items", label: "議案・審議", perm: "agenda:view" },
  { path: "/audit", label: "監査ワークベンチ", perm: "audit:engagement" },
  { path: "/findings", label: "指摘・是正", perm: "finding:create" },
  { path: "/evidence", label: "証拠ビューア", perm: "evidence:view" },
  { path: "/audit-log", label: "監査ログ", perm: "auditlog:view" },
  { path: "/retention", label: "保持・法的保全", perm: "retention:manage" },
  { path: "/admin", label: "管理", perm: "admin:users" },
];

export function Layout({ children, current }: { children: ReactNode; current: string }) {
  const { user, permissions, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.perm || can(permissions, n.perm));
  return (
    <div className="app">
      <button className="menu-toggle" aria-label="メニューを開く" onClick={() => setOpen(true)}>
        ☰
      </button>
      <nav className={`sidebar ${open ? "open" : ""}`} aria-label="メインナビゲーション">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>みらい取締役会・</strong>
            <strong>監査統合基盤</strong>
            <small>MVP デモ</small>
          </div>
        </div>
        <ul>
          {items.map((n) => (
            <li key={n.path}>
              <a
                href={`#${n.path}`}
                className={current === n.path || current.startsWith(n.path + "/") ? "active" : ""}
                aria-current={current === n.path || current.startsWith(n.path + "/") ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/admin")}>
            要件対応表
          </button>
        </div>
      </nav>
      {open ? <div className="overlay" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <div className="main">
        <header className="topbar">
          <h1>{NAV.find((n) => current === n.path || current.startsWith(n.path + "/"))?.label ?? "みらい取締役会・監査統合基盤"}</h1>
          <div className="topbar-right">
            <form
              className="search-mini"
              onSubmit={(e) => {
                e.preventDefault();
                const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value;
                if (q.trim()) navigate(`/search?q=${encodeURIComponent(q)}`);
              }}
            >
              <label className="visually-hidden" htmlFor="global-q">検索</label>
              <input id="global-q" name="q" placeholder="検索（議案・監査・指摘）" aria-label="検索" />
            </form>
            <div className="user-box">
              {user ? (
                <>
                  <div className="user-meta">
                    <strong>{user.name}</strong>
                    <small>{user.title}</small>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={logout}>
                    ログアウト
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
