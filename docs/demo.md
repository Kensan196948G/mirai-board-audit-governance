# デモ手順（MVP）

## 1. ローカル起動

```bash
npm ci
npm run build:web
npm run dev
```

- アプリ: http://localhost:8790
- ヘルスチェック: http://localhost:8790/api/health

## 2. デモデータ投入

```bash
npm run seed
```

投入内容（架空データ）:
- デモユーザー 12名（取締役・監査役・事務局・内部監査・主管・法務・記録管理・管理者ほか）
- 会議体: 取締役会 / 監査役会 / 内部監査
- 会議・招集・出欠イベント、議案6件（作成〜決議・Manifest・履行まで多段階）
- 監査ユニバース・リスク評価・年度計画・個別監査・調書・指摘・回答・是正・再検証
- 監査ログチェーン（前後ハッシュ付き）

## 3. 主要デモシナリオ

1. 取締役会シナリオ: 議案一覧 → 議案詳細 → 利益相反申告/判定 → 資料パッケージ固定 → 資格・定足数 → 正式議決 → 決議確定（Evidence Manifest生成）→ 履行タスク → 独立確認
2. 内部監査シナリオ: 監査ワークベンチ → ユニバース/リスク評価/年度計画 → 個別監査 → 手続・調書 → レビュー（作成者本人は409）→ 指摘確定 → 経営回答 → 是正 → 再検証
3. 統制シナリオ: 監査ログ検索・チェーン検証 / Evidence Manifest検証 / 法的保全中の廃棄拒否 / AI草案の出典不足拒否

## 4. Preview 確認

動作確認中のPreview: https://mirai-board-audit-governance-preview.kensan1969.workers.dev

デモアカウントはログイン画面の一覧から選択（すべて架空）。主要デモは「取締役 佐藤美咲」でログインし、議案一覧 → 子会社みらいエナジー株式譲渡契約（議決・決議確定・Manifest封緘）を一巡。監査は「内部監査 山田拓也 / 佐々木誠」で監査ワークベンチから指摘・是正・再検証を確認できます。

## 5. WebUI（ドキュメント・モックアップ配信）

- 公開URL: https://mbag.mirai-dx-platform.com/（ルートはモックアップPart4を表示）
- 一覧: https://mbag.mirai-dx-platform.com/index.html
- デモガイド: https://mbag.mirai-dx-platform.com/guide.html
- 要件対応表: https://mbag.mirai-dx-platform.com/requirements.html
- ローカル: http://192.168.0.185:8090/
