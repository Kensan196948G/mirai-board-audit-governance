# 実装計画・進捗（2026-08-12）

## 1. 目標

モックアップ・要件定義（FR-01〜15 / BR / NFR）に基づき、実際に操作・評価できるMVP/Prototypeを完成させる。本番運用化は対象外。Preview は Cloudflare Workers + D1 で提供し、ローカルでも `wrangler dev` で同一動作させる。

## 2. 技術構成

- バックエンド: Cloudflare Workers + Hono + TypeScript
- DB: D1（SQLite互換）。migration は `migrations/`、ダミーデータは `seed/seed.sql` で再生成可能に管理
- フロント: React 19 + Vite + TypeScript（プレーンCSS、レスポンシブ）
- テスト: Node標準テストランナー（ユニット・統合・認可・異常系）をNode + SQLite（D1互換アダプタ）で実行。vitestは本環境の仮想メモリ制限(20GB)でWasm初期化不能のため不使用
- ローカル実行: この環境ではworkerdが仮想メモリ制限(20GB)で起動不可のため、`@hono/node-server` + node:sqlite で同一コードを実行（D1と同一SQL・同一バッチ原子性）
- Preview: Cloudflare Workers + D1 へデプロイし、HTTPスモークで検証
- CI: GitHub Actions（install → lint → typecheck → test → build → dry-run deploy）
- Git: main 直接push禁止、feature branch → PR → CI成功後に自動マージ

## 3. フェーズ

| Phase | 内容 | 状態 |
|---|---|---|
| 0. Monitor | 文書・モックアップ・環境・接続先精査 | ✅ 完了 |
| 1. Assessment | 評価・ギャップ分析 → `docs/assessment.md` | ✅ 完了 |
| 2. Scaffold | リポジトリ初期化・package.json・wrangler設定・CI骨格・API契約 | ✅ 完了 |
| 3. Backend | スキーマ/migration/seed、認証認可、会議・議案・決議・Manifest・監査フロー、監査ログチェーン、通知・検索・KPI・CSV、保持・法的保全、AI草案ガード、テスト | ✅ 完了 |
| 4. Frontend | 画面一式（ログイン/ダッシュボード/マイタスク/会議/議案/決議/議事録/監査/調書/指摘/証拠/ログ/管理/要件対応）、レスポンシブ・a11y | ✅ 完了 |
| 5. Verify | lint / typecheck / test / build / e2eスモーク / previewデプロイ | ✅ 完了 |
| 6. Review | 主任レビュー・不整合修正・セキュリティ確認 | ✅ 完了 |
| 7. Git/Release | commit → push → PR → CI成功 → auto-merge | ✅ 完了（PR #1 merged） |
| 8. Re-assessment | 完了条件チェック・残課題をバックログ化・最終報告 | ✅ 完了 |

## 4. 完了条件（MVP）

1. 代表2シナリオが画面・API・DBで一連動作する
2. 認証（デモログイン）とサーバ側RBAC/ABAC（存在非露出含む）が効く
3. 資格・定足数、Evidence Manifest原子生成、議事録二重記名拒否、監査調書SoD、監査ログチェーンがテストで検証済み
4. 有効な架空ダミーデータが投入・保持され、空画面がない
5. lint / typecheck / test / build / CI が全て成功
6. README・設計・起動・デモ手順が実装と一致
7. Preview URL（workers.dev）で操作可能
8. PRがAuto-merge済み、P0ゼロ、主要P1解消

## 5. 役割分担（Agent Team）

| 役割 | 担当 | 責務 |
|---|---|---|
| CTO/主任（統合） | root | 計画・契約・統合・品質・Git・完了判定 |
| Backend Developer | subagent `backend` | API/DB/認可/テスト（`src/` `migrations/` `seed/` `tests/`） |
| Frontend Developer | subagent `frontend` | UI一式（`web/`） |
| CI/品質 | root または subagent | GitHub Actions、ビルド検証、ドキュメント整合 |

## 6. リスクと対策

| リスク | 対策 |
|---|---|
| D1とローカルの差異 | 統合テストは vitest-pool-workers でD1実物相当（Miniflare）を使用 |
| フロント/バックの契約ずれ | `docs/api-contract.md` を固定し、両者並行実装、統合時に実レスポンスで確認 |
| 並列書き込み衝突 | backend=src等、frontend=web とファイル所有を分離。package.json は主任のみ編集 |
| Cloudflare無料枠の制約 | ダミーデータは小規模・インデックス付与・バッチ制限内に設計 |

## 7. 進捗記録

- 2026-08-12: Phase 0/1 完了。スキャフォールド作成中。
- 2026-08-12: Phase 2/3/4 完了（バックエンド全API・seed・テスト21件、フロント全画面・ビルド成功）。Phase 5 進行中。
- 2026-08-12: Phase 5〜8 完了。Previewデプロイ・E2E全チェック成功、PR #1 をCI成功後に自動マージ。main = 4b858ed。
- 2026-08-12: 再評価（第2回）完了。WebUI（IP:8090 + systemd）追加、seed再実行の冪等性を修正しテスト23件へ拡充。全PR（#1〜#5）マージ済み。
- 2026-08-12: WebUI拡充（ランディング＋デモガイド・要件対応・API概要・変更履歴）とカスタムドメイン `mbag.mirai-dx-platform.com` 公開（Cloudflare Tunnel + systemd）。全クリックを実リンク化し疑似無反応を排除。

## 8. 完了サマリ（Re-assessment）

- P0（秘密入力・権限外露出・監査ログ破損）: 解消。ブラウザ秘密入力なし、認可は存在非露出（404）、監査イベントは追記型チェーン＋検証API。
- 主要P1（資格・定足数、Manifest原子生成、SoD、二重記名拒否）: テストで検証済み。
- 主要ユースケース: 取締役会・内部監査の2シナリオがローカル（:8790）とPreviewの両方で一連動作。
- ダミーデータ: seedにより再生成可能・保持済み（Previewにも投入済み）。
- 品質ゲート: lint / typecheck / test 21件 / build / CI（quality）すべて成功。
- 残課題: docs/backlog.md（B-01〜B-12）。本番運用化は今回の対象外。
