# みらい取締役会・監査統合基盤（Mirai Board & Audit Governance Hub）

取締役会の招集・議案・審議・決議・議事録・履行と、内部監査の計画・手続・調書・指摘・是正・再検証を、機密区分と証跡を保った一つの追跡面で可視化する統制・証跡ハブの **MVP / Prototype** です。

> 本リポジトリのデータはすべて架空のデモ用ダミーデータです。本番運用・実データ投入は対象外です。

## ドキュメント

- [企画書](./企画書.html) / [要件定義書](./要件定義書.html) / [詳細仕様設計書](./詳細仕様設計書.html) / [モックアップ](./みらい取締役会・監査統合基盤モックアップPart4.html)
- [評価・ギャップ分析](./docs/assessment.md)
- [実装計画・進捗](./docs/plan.md)
- [API契約](./docs/api-contract.md)
- [バックログ](./docs/backlog.md)
- [デモ手順](./docs/demo.md)

## 技術構成

- バックエンド: Cloudflare Workers + Hono + TypeScript
- DB: Cloudflare D1（SQLite互換）
- フロント: React 19 + Vite + TypeScript
- テスト: Node標準テストランナー（node:test）+ ローカルSQLite（D1互換アダプタ）
- CI: GitHub Actions（lint / typecheck / test / build / wrangler dry-run）

## セットアップ

```bash
npm ci
npm run build:web   # 初回はフロントのビルドが必要
npm run dev         # http://localhost:8790 で起動
npm run seed        # デモデータ投入（--url でPreview先も指定可）
```

`.dev.vars` は初回起動時にランダムなローカル専用秘密値で自動作成されます（コミットしない）。

## 検証コマンド

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Preview（Cloudflare Workers + D1）

`npm run deploy:preview` で workers.dev にデプロイできます。Preview URL とデモアカウントは [docs/demo.md](./docs/demo.md) に記載します。

## ライセンス

未設定（権利者判断が必要）。詳細は [docs/backlog.md](./docs/backlog.md) の B-01 を参照。
