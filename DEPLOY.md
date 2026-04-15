# デプロイ手順（Railway）

## 前提条件

- GitHubリポジトリにプッシュ済みであること
- Railwayアカウントがあること（https://railway.app）
- Google OAuth トークンが取得済みであること（ローカルで `npm run auth` 完了済み）

## 手順

### 1. Railwayプロジェクト作成

1. https://railway.app でログイン
2. 「New Project」→「Deploy from GitHub repo」
3. `drug-shortage-line-alert` リポジトリを選択
4. Dockerfileが自動検出される

### 2. 環境変数の設定

Railway の「Variables」タブで以下を設定する。

| 変数 | 値 | 備考 |
|------|-----|------|
| `GOOGLE_CLIENT_ID` | GCPコンソールから取得 | 必須 |
| `GOOGLE_CLIENT_SECRET` | GCPコンソールから取得 | 必須 |
| `GOOGLE_TOKENS_JSON` | `credentials/tokens.json` の中身をそのままペースト | 必須（ファイルの代わり） |
| `SPREADSHEET_ID` | スプレッドシートURLの `/d/XXXXX/edit` 部分 | 必須 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers から取得 | 必須 |
| `LINE_CHANNEL_SECRET` | LINE Developers から取得 | 必須 |
| `LINE_GROUP_ID` | Webhook経由で取得済みのもの | 必須 |
| `DASHBOARD_URL` | Railwayが発行するURL（デプロイ後に設定） | 任意 |
| `TZ` | `Asia/Tokyo` | 推奨 |

### 3. デプロイ確認

1. Railwayがビルド・デプロイを自動実行
2. デプロイ完了後、発行されたURLにアクセス
3. `/health` エンドポイントで稼働確認

```bash
curl https://<railway-url>/health
```

正常時のレスポンス:
```json
{"status":"ok","sheets":"connected","items":42,"uptime":123.456}
```

### 4. DASHBOARD_URL の更新

1. Railwayが発行したURLを `DASHBOARD_URL` 環境変数にセット
2. LINE通知内のリンクがこのURLを指すようになる

### 5. 動作確認チェックリスト

- [ ] `/health` が `status: ok` を返す
- [ ] `/api/status` が在庫品目数を返す
- [ ] `/api/today` が今日の変化を返す
- [ ] 管理画面（`/`）が表示される
- [ ] CSVアップロードが動作する
- [ ] 翌朝の通知が届く（翌日確認）

## トラブルシューティング

### Google Sheets API エラー

- `GOOGLE_TOKENS_JSON` が正しくペーストされているか確認
- トークンが期限切れの場合はローカルで `npm run auth` を再実行し、新しいトークンを環境変数に貼り直す

### cron が JST で動かない

- `TZ=Asia/Tokyo` が環境変数に設定されているか確認
- `scheduler.mjs` のcronスケジュールに `timezone: "Asia/Tokyo"` が指定済み（二重対策）

### ヘルスチェック失敗

- `/health` が 503 を返す場合、Google Sheets API との接続に問題がある
- Railwayのログで具体的なエラーメッセージを確認する
