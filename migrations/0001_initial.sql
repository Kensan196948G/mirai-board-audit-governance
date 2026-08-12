-- みらい取締役会・監査統合基盤 MVP v1 スキーマ
-- D1 (SQLite) とローカルSQLiteの両方で動作する共通SQL

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  outside INTEGER NOT NULL DEFAULT 0,
  body_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bodies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body_type TEXT NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  outside_minimum INTEGER NOT NULL DEFAULT 0,
  quorum_formula TEXT NOT NULL DEFAULT 'majority',
  vote_rule TEXT NOT NULL DEFAULT 'majority',
  minutes_signatory_rule TEXT NOT NULL DEFAULT 'chair_and_2',
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS governance_rules (
  id TEXT PRIMARY KEY,
  body_id TEXT NOT NULL REFERENCES bodies(id),
  version INTEGER NOT NULL,
  rule_type TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  quorum_formula TEXT NOT NULL,
  vote_rule TEXT NOT NULL,
  signatory_rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  body_id TEXT NOT NULL REFERENCES bodies(id),
  title TEXT NOT NULL,
  held_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  method TEXT NOT NULL DEFAULT 'in_person',
  chair_user_id TEXT REFERENCES users(id),
  rule_version_id TEXT REFERENCES governance_rules(id),
  notice_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS convocations (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  issued_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  issued_by TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'issued',
  note TEXT
);

CREATE TABLE IF NOT EXISTS delivery_receipts (
  id TEXT PRIMARY KEY,
  convocation_id TEXT NOT NULL REFERENCES convocations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'app',
  status TEXT NOT NULL DEFAULT 'pending',
  received_at TEXT,
  UNIQUE (convocation_id, user_id)
);

CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT,
  recorded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id),
  body_id TEXT NOT NULL REFERENCES bodies(id),
  type TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'internal',
  title TEXT NOT NULL,
  summary TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'created',
  rule_version_id TEXT REFERENCES governance_rules(id),
  due_at TEXT,
  urgent INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_status_history (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  by_user TEXT REFERENCES users(id),
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opinions (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  opinion_type TEXT NOT NULL DEFAULT 'prior',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conflict_declarations (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'declared',
  reason TEXT,
  classification TEXT NOT NULL DEFAULT 'confidential',
  declared_at TEXT NOT NULL,
  declared_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conflict_determinations (
  id TEXT PRIMARY KEY,
  conflict_id TEXT NOT NULL REFERENCES conflict_declarations(id),
  determiner_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  controls TEXT NOT NULL DEFAULT '{"view":"allowed","deliberate":"allowed","vote":"allowed","notify":"allowed"}',
  reason TEXT,
  rule_version_id TEXT REFERENCES governance_rules(id),
  determined_at TEXT NOT NULL,
  valid_until TEXT
);

CREATE TABLE IF NOT EXISTS deliberation_packages (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  version INTEGER NOT NULL,
  fixed_at TEXT NOT NULL,
  fixed_by TEXT NOT NULL REFERENCES users(id),
  rule_version_id TEXT REFERENCES governance_rules(id),
  status TEXT NOT NULL DEFAULT 'fixed',
  verification_result TEXT NOT NULL DEFAULT 'ok',
  previous_id TEXT REFERENCES deliberation_packages(id)
);

CREATE TABLE IF NOT EXISTS deliberation_package_items (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES deliberation_packages(id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  uri TEXT,
  sha256_full TEXT NOT NULL,
  citation_locator TEXT,
  classification TEXT NOT NULL DEFAULT 'confidential',
  content_excerpt TEXT
);

CREATE TABLE IF NOT EXISTS eligibility_snapshots (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  as_of TEXT NOT NULL,
  rule_version_id TEXT REFERENCES governance_rules(id),
  calculation_inputs TEXT NOT NULL DEFAULT '{}',
  total_members INTEGER NOT NULL,
  actual_attendees INTEGER NOT NULL DEFAULT 0,
  recused_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  required_quorum INTEGER NOT NULL DEFAULT 0,
  meets_quorum INTEGER NOT NULL DEFAULT 0,
  computed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS individual_votes (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  meeting_id TEXT REFERENCES meetings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  option TEXT NOT NULL,
  reason TEXT,
  conditions TEXT,
  cast_at TEXT NOT NULL,
  etag_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (agenda_id, user_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  meeting_id TEXT REFERENCES meetings(id),
  status TEXT NOT NULL DEFAULT 'open',
  outcome TEXT,
  conditions TEXT,
  dissent TEXT,
  tally TEXT,
  decided_at TEXT,
  decided_by TEXT REFERENCES users(id),
  rule_version_id TEXT REFERENCES governance_rules(id),
  evidence_manifest_id TEXT,
  previous_decision_id TEXT REFERENCES decisions(id)
);

CREATE TABLE IF NOT EXISTS minutes (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  status TEXT NOT NULL DEFAULT 'drafting',
  current_version_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS minutes_versions (
  id TEXT PRIMARY KEY,
  minutes_id TEXT NOT NULL REFERENCES minutes(id),
  version_no INTEGER NOT NULL,
  content TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  sha256_full TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS minutes_signatories (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES minutes_versions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  signed_at TEXT NOT NULL,
  verification_result TEXT NOT NULL DEFAULT 'ok',
  invalidated_at TEXT,
  invalidated_by TEXT REFERENCES users(id),
  UNIQUE (version_id, user_id)
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  decision_id TEXT REFERENCES decisions(id),
  finding_id TEXT REFERENCES findings(id),
  agenda_id TEXT REFERENCES agenda_items(id),
  title TEXT NOT NULL,
  description TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  confirmer_user_id TEXT REFERENCES users(id),
  due_at TEXT NOT NULL,
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_events (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES actions(id),
  event_type TEXT NOT NULL,
  note TEXT,
  evidence_sha256 TEXT,
  by_user TEXT REFERENCES users(id),
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  acknowledged_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_universes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES audit_universes(id),
  fiscal_year INTEGER NOT NULL,
  inherent_risk INTEGER NOT NULL,
  control_risk INTEGER NOT NULL,
  score INTEGER NOT NULL,
  basis TEXT,
  status TEXT NOT NULL DEFAULT 'assessed',
  assessed_by TEXT REFERENCES users(id),
  assessed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annual_plans (
  id TEXT PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  annual_plan_id TEXT REFERENCES annual_plans(id),
  universe_id TEXT REFERENCES audit_universes(id),
  title TEXT NOT NULL,
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  start_on TEXT,
  end_on TEXT,
  owner_id TEXT REFERENCES users(id),
  independence_declared INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  title TEXT NOT NULL,
  objective TEXT,
  population_count INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  sampling_basis TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workpapers (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL REFERENCES procedures(id),
  title TEXT NOT NULL,
  content TEXT,
  version_no INTEGER NOT NULL DEFAULT 1,
  author_id TEXT NOT NULL REFERENCES users(id),
  reviewer_id TEXT REFERENCES users(id),
  approver_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workpaper_versions (
  id TEXT PRIMARY KEY,
  workpaper_id TEXT NOT NULL REFERENCES workpapers(id),
  version_no INTEGER NOT NULL,
  content TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  sha256_full TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_signoffs (
  id TEXT PRIMARY KEY,
  workpaper_id TEXT NOT NULL REFERENCES workpapers(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  comment TEXT,
  version_no INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  workpaper_id TEXT REFERENCES workpapers(id),
  title TEXT NOT NULL,
  criterion TEXT NOT NULL,
  fact TEXT NOT NULL,
  cause TEXT,
  impact TEXT,
  recommendation TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'draft',
  finalized_by TEXT REFERENCES users(id),
  finalized_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS management_responses (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  agree INTEGER NOT NULL,
  response_text TEXT,
  plan TEXT,
  due_at TEXT,
  respondent_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_acceptances (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  acceptor_id TEXT NOT NULL REFERENCES users(id),
  authority TEXT NOT NULL,
  rationale TEXT,
  expiry_at TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS remediations (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  description TEXT NOT NULL,
  due_at TEXT,
  owner_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'in_progress',
  evidence_manifest_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retests (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  tester_id TEXT NOT NULL REFERENCES users(id),
  result TEXT NOT NULL,
  note TEXT,
  tested_at TEXT NOT NULL,
  evidence_manifest_id TEXT,
  reopened_finding_id TEXT REFERENCES findings(id)
);

CREATE TABLE IF NOT EXISTS evidence_manifests (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  package_id TEXT,
  content TEXT NOT NULL,
  sha256_full TEXT NOT NULL,
  fixed_at TEXT NOT NULL,
  fixed_by TEXT NOT NULL REFERENCES users(id),
  previous_manifest_id TEXT,
  status TEXT NOT NULL DEFAULT 'sealed'
);

CREATE TABLE IF NOT EXISTS retention_rules (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  trigger TEXT NOT NULL,
  years INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS legal_holds (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  started_by TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  released_by TEXT REFERENCES users(id),
  released_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS disposal_candidates (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  legal_hold_checked_at TEXT,
  requested_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  executed_by TEXT REFERENCES users(id),
  executed_at TEXT,
  certificate_hash TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  actor_id TEXT REFERENCES users(id),
  delegated_by TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  resource_version TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  correlation_id TEXT,
  occurred_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  signature_ref TEXT
);

CREATE TABLE IF NOT EXISTS ai_drafts (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL REFERENCES agenda_items(id),
  body TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  saved_at TEXT,
  shared_at TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_audit_events_seq ON audit_events(seq);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_agenda_items_status ON agenda_items(status);
CREATE INDEX IF NOT EXISTS idx_agenda_items_body ON agenda_items(body_id);
CREATE INDEX IF NOT EXISTS idx_actions_owner ON actions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
CREATE INDEX IF NOT EXISTS idx_findings_engagement ON findings(engagement_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_workpapers_procedure ON workpapers(procedure_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);
CREATE INDEX IF NOT EXISTS idx_meetings_body ON meetings(body_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_meeting ON attendance_events(meeting_id);
CREATE INDEX IF NOT EXISTS idx_legal_holds_status ON legal_holds(scope_type, scope_id, status);
