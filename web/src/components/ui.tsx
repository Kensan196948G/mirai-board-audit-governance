import type { ReactNode } from "react";
import { api } from "../api";

export function Spinner() {
  return <p className="muted" aria-live="polite">読み込み中…</p>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "エラーが発生しました";
  const correlationId = error instanceof Error && "error" in error ? String((error as { error?: { correlationId?: string } }).error?.correlationId ?? "") : "";
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {correlationId ? <p className="muted">相関ID: {correlationId}</p> : null}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="muted empty">{text}</p>;
}

export function Badge({ tone = "gray", children }: { tone?: "green" | "red" | "orange" | "blue" | "gray" | "purple"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const STATUS_TONES: Record<string, "green" | "red" | "orange" | "blue" | "gray" | "purple"> = {
  finalized: "green",
  closed: "green",
  confirmed: "green",
  saved: "green",
  shared: "green",
  reviewed: "green",
  approved: "green",
  disposed: "green",
  in_progress: "blue",
  in_review: "blue",
  convened: "blue",
  submitted: "blue",
  decision_pending: "orange",
  remediating: "orange",
  awaiting_response: "orange",
  evidence_submitted: "orange",
  pending_approval: "orange",
  returned: "orange",
  extended: "orange",
  reopened: "red",
  withdrawn: "red",
  draft: "gray",
  created: "gray",
  planned: "gray",
  prepared: "gray",
  candidate: "gray",
  rejected: "red",
  active: "green",
  released: "gray",
  finalized_: "green",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = STATUS_TONES[String(status ?? "")] ?? "gray";
  return <Badge tone={tone}>{String(status ?? "unknown")}</Badge>;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {title ? (
        <div className="card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Button({ children, onClick, kind = "primary", type = "button", disabled }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; type?: "button" | "submit"; disabled?: boolean }) {
  return (
    <button type={type} className={`btn btn-${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function loadList<T>(path: string): Promise<T[]> {
  const res = await api<{ items: T[] }>(path);
  return res.items;
}
