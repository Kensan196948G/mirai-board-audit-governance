import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, ErrorBox, Field, StatusBadge } from "../components/ui";
import { navigate } from "../router";

export function SearchPage({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<unknown>(null);

  const search = (query: string) => {
    if (!query.trim()) {
      setItems([]);
      return;
    }
    api<{ items: Array<Record<string, unknown>> }>(`/search?q=${encodeURIComponent(query)}`).then((r) => setItems(r.items)).catch(setError);
  };
  useEffect(() => search(initial), [initial]);

  const hrefFor = (kind: string, id: string) => {
    if (kind === "agenda_item") return `/agenda-items/${id}`;
    if (kind === "finding") return `/findings/${id}`;
    if (kind === "meeting") return `/meetings/${id}`;
    return "/";
  };

  return (
    <Card title="検索">
      <form
        className="filter-row"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/search?q=${encodeURIComponent(q)}`);
          search(q);
        }}
      >
        <Field label="キーワード">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="件名・概要・事実" />
        </Field>
        <button type="submit" className="btn">検索</button>
      </form>
      {error ? <ErrorBox error={error} /> : null}
      <ul className="link-list">
        {items.map((it) => (
          <li key={`${String(it.kind)}-${String(it.id)}`}>
            <a href={`#${hrefFor(String(it.kind), String(it.id))}`}>
              {String(it.title)} <StatusBadge status={String(it.status)} /> <span className="muted">（{String(it.kind)}）</span>
            </a>
          </li>
        ))}
      </ul>
      {!error && items.length === 0 ? <p className="muted empty">該当なし（権限内のみ検索されます）</p> : null}
    </Card>
  );
}
