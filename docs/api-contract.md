# API 契約（MVP v1）

ベースパス: `/api`。すべての応答は JSON（CSV/HTMLエクスポートを除く）。認証は `Authorization: Bearer <token>`。失敗時の共通形:

```json
{ "error": { "code": "NOT_FOUND|FORBIDDEN|CONFLICT|VALIDATION|QUORUM|SOD|MANIFEST|INTERNAL", "message": "内部情報を伏せた文言", "correlationId": "req_xxx", "details": {} } }
```

認可拒否は対象の存在を露出しないため原則 404 を返す（操作権限欠如も同様）。バリデーションは 400、状態遷移違反は 409、定足数不足・集計不整合は 422。

## 認証

| Method / Path | 内容 |
|---|---|
| POST `/api/auth/login` | `{ userId }` → `{ token, user }`。デモ用ユーザー一覧は `GET /api/users` |
| GET `/api/auth/me` | 現在のユーザーと権限 `{ user, permissions: string[] }` |
| POST `/api/auth/logout` | 200（クライアントはトークン破棄） |

## ユーザー・組織

| Method / Path | 内容 |
|---|---|
| GET `/api/users` | デモユーザー一覧（ログイン用） |
| GET `/api/users/me/notifications` | 未読・通知一覧 |
| POST `/api/notifications/:id/acknowledge` | 受領確認 |
| POST `/api/notifications/:id/retry` | 再通知（記録のみ） |

## 会議・招集・出欠

| Method / Path | 内容 |
|---|---|
| GET `/api/meetings` | 一覧（権限内のみ） |
| POST `/api/meetings` | 会議作成 `{ bodyId, title, heldAt, method, chairUserId }` |
| GET `/api/meetings/:id` | 詳細（招集・出欠・議案・議事録を含む） |
| POST `/api/meetings/:id/convocations` | 招集通知 `{ dueAt, note }`。宛先スナップショット作成 |
| POST `/api/meetings/:id/attendance-events` | `{ userId, eventType: attend|late|leave|reenter|online, occurredAt, note }` |
| POST `/api/meetings/:id/status` | `{ status: prepared|convened|in_progress|closed|minutes_review|finalized }` |

## 議案フロー

| Method / Path | 内容 |
|---|---|
| GET `/api/agenda-items` | 一覧（権限対応、`?q=` `?status=` `?bodyId=`） |
| POST `/api/agenda-items` | 作成 `{ bodyId, meetingId?, type, classification, title, summary, ownerUserId, dueAt, urgent }` |
| GET `/api/agenda-items/:id` | 詳細（パッケージ・COI・資格・投票・決議・履行・AI草案を含む） |
| POST `/api/agenda-items/:id/submit` / `return` / `withdraw` / `resubmit` | 状態遷移 `{ reason }` |
| POST `/api/agenda-items/:id/conflicts` | 利益相反申告 `{ userId, reason, classification }` |
| POST `/api/conflicts/:id/determinations` | 判定 `{ determinerId, decision: eligible|recused|pending, controls: {view,deliberate,vote,notify}, reason, validUntil? }` |
| POST `/api/agenda-items/:id/deliberation-packages` | 資料固定 `{ items: [{ title, sourceType, sourceId, sourceVersion, uri, sha256Full, citationLocator, classification }] }`。差替は新version生成 |
| GET `/api/agenda-items/:id/eligibility` | 資格・定足数内訳（保存済みスナップショットまたは最新計算） |
| POST `/api/agenda-items/:id/votes` | 正式議決 `{ userId, option: approve|approve_with_condition|oppose|abstain, reason?, conditions? }` |
| POST `/api/agenda-items/:id/decisions` | 集計・定足数検証→決議＋Evidence Manifest原子生成 `{ outcome, conditions?, dissent?, tallyOverride? }` |
| GET `/api/decisions/:id/actions` | 履行タスク一覧 |
| POST `/api/decisions/:id/actions` | タスク生成 `[{ title, description, ownerUserId, confirmerUserId, dueAt, acceptanceCriteria }]` |
| POST `/api/actions/:id/events` | `{ eventType: started|evidence_submitted|returned|extended|completed|reopened, note, evidenceSha256? }` |

## 議事録

| Method / Path | 内容 |
|---|---|
| POST `/api/meetings/:id/minutes/versions` | 案・訂正版作成 `{ content, reason? }` |
| POST `/api/minutes/:versionId/signoffs` | 本人記名。二重記名・未権限者は 409 |

## 監査フロー

| Method / Path | 内容 |
|---|---|
| GET/POST `/api/audit-universes` | 監査ユニバース |
| GET/POST `/api/risk-assessments` | リスク評価 `{ universeId, fiscalYear, inherentRisk, controlRisk, basis }` |
| GET/POST `/api/annual-plans` | 年度計画 `{ fiscalYear, title, itemIds }` |
| GET/POST `/api/engagements` | 個別監査 `{ annualPlanId?, universeId, title, scope, startOn, endOn, ownerId }` |
| GET `/api/engagements/:id` | 詳細（手続・調書・指摘を含む） |
| POST `/api/engagements/:id/procedures` | 手続 `{ title, objective, populationCount, sampleCount, samplingBasis }` |
| POST `/api/procedures/:id/workpapers` | 調書作成 `{ title, content, evidenceRefs }` |
| POST `/api/workpapers/:id/versions` | 新版 `{ content, reason }` |
| POST `/api/workpapers/:id/review-requests` | レビュー依頼。作成者本人へは 409（SoD） |
| POST `/api/reviews/:id/decisions` | `{ decision: approve|return, comment }`。作成者本人の決定は 409 |
| POST `/api/findings` | 指摘案 `{ engagementId, workpaperId?, title, criterion, fact, cause, impact, recommendation, severity }` |
| GET `/api/findings` / `GET /api/findings/:id` | 一覧・詳細 |
| POST `/api/findings/:id/finalize` | 指摘確定（重要度確定権限者） |
| POST `/api/findings/:id/management-responses` | `{ agree, responseText, plan, dueAt }` |
| POST `/api/findings/:id/risk-acceptances` | `{ acceptorId, authority, rationale, expiryAt }` |
| POST `/api/findings/:id/remediations` | 是正証憑 `{ description, evidenceSha256 }` |
| POST `/api/findings/:id/retests` | 独立再検証 `{ result: closed|reopened, note }` |

## 証拠・監査ログ

| Method / Path | 内容 |
|---|---|
| GET `/api/manifests` / `GET /api/manifests/:id` | Evidence Manifest 一覧・詳細 |
| POST `/api/manifests/:id/verify` | ハッシュ・構成を再計算し検証結果を返す |
| GET `/api/evidence-packages/:id` | 印刷用HTML（ブラウザ印刷→PDF） |
| GET `/api/audit-events` | 検索 `?actor=&action=&resource=&from=&to=` |
| GET `/api/audit-events/verify-chain` | 全チェーンのハッシュ・欠番検証 |
| GET `/api/exports/agenda-items.csv` / `findings.csv` / `audit-events.csv` | CSV出力（権限対応） |

## 検索・ダッシュボード

| Method / Path | 内容 |
|---|---|
| GET `/api/search?q=` | 議案・会議・指摘・履行の横断検索（権限内のみ） |
| GET `/api/dashboard/kpis` | 指標: 議案処理日数、決議アクション完了率、証憑付き是正率、権限逸脱0、再現成功率、AI有効出典率 等 |

## 保持・法的保全

| Method / Path | 内容 |
|---|---|
| GET `/api/retention-rules` | 保持ルール版一覧 |
| GET `/api/legal-holds` | 法的保全一覧 |
| POST `/api/legal-holds` | 開始 `{ scopeType, scopeId, reason }` |
| POST `/api/legal-holds/:id/release` | 解除 `{ reason }` |
| GET `/api/disposals` | 廃棄候補一覧 |
| POST `/api/disposals/:id/request` / `approve` / `execute` | 申請・二者承認・実行。法的保全中は 409 |

## 管理・AI

| Method / Path | 内容 |
|---|---|
| GET `/api/admin/sod-conflicts` | 職務分離競合の計算結果 |
| GET `/api/admin/requirements` | FR/AC/NFR 対応表（実装状態・根拠API・テスト） |
| GET `/api/admin/audit-log-access` | 監査ログ閲覧権限者の一覧（デモ） |
| POST `/api/ai/drafts` | `{ agendaItemId, notes? }` → 出典引用付き草案 or 422（出典不足） |
| POST `/api/ai/drafts/:id/review` | `{ approved, comment? }` |
| POST `/api/ai/drafts/:id/save` | 出典・人レビュー必須。不備は 409 |
| POST `/api/ai/drafts/:id/share` | 保存済み・レビュー済みのみ 200 |

## 権限モデル（RBAC + ABAC）

ロール: `director` / `kansa_yaku` / `secretariat` / `internal_auditor` / `internal_audit_manager` / `business_owner` / `legal` / `records` / `admin` / `audit_log_viewer`

- 全操作はサーバ側で `permissions` と `can(user, action, resource)` により判定
- 議案の閲覧・審議・議決・通知は COI 判定の操作別制御を参照（ABAC）
- 監査調書は作成者≠レビュー者（SoD、サーバ強制）
- 決議確定・指摘確定・再検証は権限者限定
- 監査役等は議決権なし（vote:cast を持たない）
- 認可拒否は404（存在非露出）
