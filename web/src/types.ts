export type Role =
  | "director"
  | "kansa_yaku"
  | "secretariat"
  | "internal_auditor"
  | "internal_audit_manager"
  | "business_owner"
  | "legal"
  | "records"
  | "admin"
  | "audit_log_viewer";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  outside: boolean;
  bodyIds: string[];
};

export type ApiError = {
  code: string;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
};

export type AgendaItem = Record<string, unknown> & { id: string; title: string; status: string; body_id: string };
export type Meeting = Record<string, unknown> & { id: string; title: string; status: string; held_at: string };
export type Finding = Record<string, unknown> & { id: string; title: string; status: string; severity: string };
export type Engagement = Record<string, unknown> & { id: string; title: string; status: string };
export type Manifest = Record<string, unknown> & { id: string; status: string; subject_type: string };
export type Notification = Record<string, unknown> & { id: string; title: string; status: string; created_at: string };
