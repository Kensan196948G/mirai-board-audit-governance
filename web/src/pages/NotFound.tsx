import { navigate } from "../router";

export function NotFound() {
  return (
    <section className="card">
      <h2>ページが見つかりません</h2>
      <p className="muted">対象が見つからないか、閲覧権限がありません。</p>
      <button type="button" className="btn" onClick={() => navigate("/")}>
        ダッシュボードへ
      </button>
    </section>
  );
}
