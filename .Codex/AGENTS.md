# みらい取締役会・監査統合基盤 — プロジェクト運用ポリシー

本ファイルは `AGENTS.md` の複製です。内容は常に `AGENTS.md` を正とします。

## 1. プロジェクト情報

| 項目 | 内容 |
|---|---|
| プロジェクト名 | みらい取締役会・監査統合基盤 (Mirai Board & Audit Governance Hub) |
| 目的 | 取締役会の招集・議案・審議・決議・議事録・履行と、内部監査の計画・手続・調書・指摘・是正・再検証を、機密区分と証跡を保った一つの追跡面で可視化する統制・証跡ハブ |
| 主な利用者 | 取締役、監査役等、会議体事務局、内部監査、主管・被監査部門、法務・記録管理、システム管理者 |
| 技術スタック | Cloudflare Workers (Hono) / D1 (SQLite) / React + Vite + TypeScript / Vitest / GitHub Actions |
| リポジトリ | https://github.com/Kensan196948G/mirai-board-audit-governance (private) |

## 2. 言語と対応

- 日本語で対応・解説する。コード内コメントは英語可。

## 3. 運用ループ

`Monitor -> Build -> Verify -> Improve`。優先順位は `Verify > Build > Monitor > Improve`。

## 4. STABLE 判定

test / lint / build / CI success かつ error 0 / security critical issue 0 で STABLE。未達は merge / deploy 禁止。

## 5. Git / GitHub ルール

main 直接 push 禁止、branch + PR 必須、CI 成功のみ merge。秘密情報をコミットしない。

## 6. 設計原則

要件から逆算、単一の真実を `docs/` に集約、受入れ基準をテストへ落とす。証跡は追記型・不変。ブラウザへ秘密値を入力・保持させない。

## 7. 参照先

- 企画書: `企画書.html` / 要件定義書: `要件定義書.html` / 詳細仕様: `詳細仕様設計書.html`
- モックアップ: `みらい取締役会・監査統合基盤モックアップPart4.html`
- 実装計画: `docs/plan.md` / 評価: `docs/assessment.md` / API: `docs/api-contract.md` / バックログ: `docs/backlog.md` / デモ: `docs/demo.md`
