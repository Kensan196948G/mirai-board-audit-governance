# みらい取締役会・監査統合基盤 — プロジェクト運用ポリシー

## 0. 適用範囲

本ファイルはリポジトリルートの `AGENTS.md` として配置するプロジェクト単位の Codex 運用ポリシーです。
グローバル設定の運用方針を継承しつつ、本プロジェクト固有の方針を定義します。
`.Codex/AGENTS.md` は本ファイルの複製です。

## 1. プロジェクト情報

| 項目 | 内容 |
|---|---|
| プロジェクト名 | みらい取締役会・監査統合基盤 (Mirai Board & Audit Governance Hub) |
| 目的 | 取締役会の招集・議案・審議・決議・議事録・履行と、内部監査の計画・手続・調書・指摘・是正・再検証を、機密区分と証跡を保った一つの追跡面で可視化する統制・証跡ハブ |
| 主な利用者 | 取締役、監査役等、会議体事務局、内部監査、主管・被監査部門、法務・記録管理、システム管理者 |
| 技術スタック | Cloudflare Workers (Hono) / D1 (SQLite) / React + Vite + TypeScript / Vitest / GitHub Actions |
| 準拠規格 | 会社法・定款・取締役会規程等の機関設計は導入主体の専門家確認を前提。本リポジトリはサンプル規程版として管理 |
| リポジトリ | https://github.com/Kensan196948G/mirai-board-audit-governance (private) |

## 2. 言語と対応

- 日本語で対応・解説する
- コード内コメントは英語可

## 3. 運用ループ

`Monitor -> Build -> Verify -> Improve` の順で進めます。
ループ判定は時間ではなく現在の主作業内容で行い、優先順位は `Verify > Build > Monitor > Improve`。
小変更なら `Monitor -> Build -> Verify` のみでもよい。大変更のときだけ Improve と複数エージェントを厚く使う。

## 4. STABLE 判定

以下をすべて満たした場合のみ STABLE とします。

- test success
- lint success
- build success
- CI success
- error 0
- security critical issue 0

STABLE 未達は merge / deploy 禁止。

## 5. Git / GitHub ルール

- main 直接 push 禁止
- branch または WorkTree 必須
- PR 必須
- CI 成功のみ merge 許可
- Issue 駆動開発を推奨
- 秘密情報（.env、トークン、APIキー、個人・会社実データ）をコミットしない

## 6. 設計原則

- 要件から逆算する（目的、対象ユーザー、規格制約、受入れ条件を先に固定）
- 要件・設計・実装・検証を切り離さない
- 単一の真実を持つ（仕様は `docs/` に集約し、README・画面・API・DBと整合させる）
- 受入れ基準をテストへ落とす
- 証跡（Evidence Manifest・監査イベントチェーン）は追記型・不変を原則とする
- ブラウザへ秘密値を入力・保持させない

## 7. 参照先

- 企画書: `企画書.html`
- 要件定義書: `要件定義書.html`
- 詳細仕様設計書: `詳細仕様設計書.html`
- モックアップ: `みらい取締役会・監査統合基盤モックアップPart4.html`
- 実装計画・進捗: `docs/plan.md`
- 評価・ギャップ分析: `docs/assessment.md`
- API仕様: `docs/api-contract.md`
- バックログ: `docs/backlog.md`
- デモ手順: `docs/demo.md`
