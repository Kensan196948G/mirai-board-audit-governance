export type AppEnv = Env & {
  SESSION_SECRET?: string;
  SEED_KEY?: string;
};

export type UserRole =
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

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  department: string;
  outside: boolean;
  bodyIds: string[];
};
