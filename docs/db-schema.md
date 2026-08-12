# DBスキーマ設計（MVP v1）

すべてのテーブルは D1（SQLite）とローカルSQLiteで同一SQLが動くこと。主キーは `TEXT` のID（`crypto.randomUUID()` または規則化ID）を基本とし、日時は ISO8601 の `TEXT`、真偽は `INTEGER 0/1`。

## マスタ・組織

| テーブル | 主要カラム |
|---|---|
| users | id, name, email, role, title, department, outside(0/1), body_ids(JSON), active |
| bodies | id, name, body_type, member_count, outside_minimum, quorum_formula, vote_rule, minutes_signatory_rule, status |
| governance_rules | id, body_id, version, rule_type, effective_from, effective_to, quorum_formula, vote_rule, signatory_rule, status |

## 会議・議案

| テーブル | 主要カラム |
|---|---|
| meetings | id, body_id, title, held_at, status, method, chair_user_id, rule_version_id, notice_at, created_by, created_at |
| convocations | id, meeting_id, issued_at, due_at, issued_by, status, note |
| delivery_receipts | id, convocation_id, user_id, channel, status, received_at |
| attendance_events | id, meeting_id, user_id, event_type, occurred_at, note, recorded_by |
| agenda_items | id, meeting_id, body_id, type, classification, title, summary, owner_user_id, status, rule_version_id, due_at, urgent, created_by, created_at, updated_at |
| agenda_status_history | id, agenda_id, from_status, to_status, reason, by_user, at |
| opinions | id, agenda_id, user_id, opinion_type, body, created_at |
| conflict_declarations | id, agenda_id, user_id, status, reason, classification, declared_at, declared_by |
| conflict_determinations | id, conflict_id, determiner_id, decision, controls(JSON), reason, rule_version_id, determined_at, valid_until |
| deliberation_packages | id, agenda_id, version, fixed_at, fixed_by, rule_version_id, status, verification_result, previous_id |
| deliberation_package_items | id, package_id, title, source_type, source_id, source_version, uri, sha256_full, citation_locator, classification |
| eligibility_snapshots | id, agenda_id, as_of, rule_version_id, calculation_inputs(JSON), total_members, actual_attendees, recused_count, pending_count, eligible_count, required_quorum, meets_quorum, computed_by, created_at |
| individual_votes | id, agenda_id, meeting_id, user_id, option, reason, conditions, cast_at, etag_version |
| decisions | id, agenda_id, meeting_id, status, outcome, conditions, dissent, tally(JSON), decided_at, decided_by, rule_version_id, evidence_manifest_id, previous_decision_id |
| minutes | id, meeting_id, status, current_version_id, created_by, created_at |
| minutes_versions | id, minutes_id, version_no, content, reason, created_by, created_at, sha256_full, status |
| minutes_signatories | id, version_id, user_id, signed_at, verification_result, invalidated_at, invalidated_by |

## 履行・通知

| テーブル | 主要カラム |
|---|---|
| actions | id, decision_id, finding_id, agenda_id, title, description, owner_user_id, confirmer_user_id, due_at, acceptance_criteria, status, created_by, created_at, updated_at |
| action_events | id, action_id, event_type, note, evidence_sha256, by_user, at |
| notifications | id, recipient_id, title, body, kind, ref_type, ref_id, status, created_at, delivered_at, acknowledged_at, retry_count |

## 内部監査

| テーブル | 主要カラム |
|---|---|
| audit_universes | id, name, category, owner, description, status, created_by, created_at |
| risk_assessments | id, universe_id, fiscal_year, inherent_risk, control_risk, score, basis, status, assessed_by, assessed_at |
| annual_plans | id, fiscal_year, title, status, approved_by, approved_at, items(JSON) |
| engagements | id, annual_plan_id, universe_id, title, scope, status, start_on, end_on, owner_id, independence_declared, created_by, created_at |
| procedures | id, engagement_id, title, objective, population_count, sample_count, sampling_basis, status, created_by, created_at |
| workpapers | id, procedure_id, title, content, version_no, author_id, reviewer_id, approver_id, status, created_at, updated_at |
| workpaper_versions | id, workpaper_id, version_no, content, evidence_refs(JSON), created_by, created_at, sha256_full |
| review_signoffs | id, workpaper_id, reviewer_id, decision, comment, version_no, created_at |
| findings | id, engagement_id, workpaper_id, title, criterion, fact, cause, impact, recommendation, severity, status, finalized_by, finalized_at, created_by, created_at |
| management_responses | id, finding_id, agree, response_text, plan, due_at, respondent_id, status, created_at |
| risk_acceptances | id, finding_id, acceptor_id, authority, rationale, expiry_at, status, created_at |
| remediations | id, finding_id, description, due_at, owner_id, status, evidence_manifest_id, created_at |
| retests | id, finding_id, tester_id, result, note, tested_at, evidence_manifest_id, reopened_finding_id |

## 証跡・保持

| テーブル | 主要カラム |
|---|---|
| evidence_manifests | id, subject_type, subject_id, package_id, content(JSON), sha256_full, fixed_at, fixed_by, previous_manifest_id, status |
| retention_rules | id, record_type, trigger, years, version, effective_from, status |
| legal_holds | id, scope_type, scope_id, reason, started_by, started_at, released_by, released_at, status |
| disposal_candidates | id, record_type, record_id, expires_at, status, legal_hold_checked_at, requested_by, approved_by, executed_by, executed_at, certificate_hash |
| audit_events | id, seq, actor_id, delegated_by, action, resource_type, resource_id, resource_version, result, reason, correlation_id, occurred_at, timezone, previous_hash, event_hash, signature_ref |
| ai_drafts | id, agenda_id, body, citations(JSON), status, created_by, created_at, reviewed_by, reviewed_at, saved_at, shared_at |

## 制約・インデックス方針

- 外部キーは `ON DELETE RESTRICT` 基本（証跡削除禁止）
- ユニーク制約: users.email / minutes_signatories(version_id, user_id) / evidence_manifests.id / agenda_status_history.id
- インデックス: audit_events.seq, audit_events.actor_id, agenda_items.status/body_id, actions.owner_user_id, findings.status, notifications.recipient_id
- audit_events は UPDATE/DELETE をアプリ層で禁止（権限なし）
- evidence_manifests 確定後は UPDATE/DELETE をアプリ層で禁止
