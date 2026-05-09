# デプロイ手順（Render）

## 現在の本番環境

- URL: https://drug-shortage-line-alert.onrender.com
- プラン: **Starter（$7/月）**
- リージョン: Oregon (US West)
- ブランチ: `master`
- ビルド: Node.js（自動検出）

## 前提条件

- GitHubリポジトリ（`yujik427/drug-shortage-line-alert`）にプッシュ済みであること
- Renderアカウントがあること（https://dashboard.render.com）
- Google OAuth トークンが取得済みであること（ローカルで `npm run auth` 完了済み）

## 初回セットアップ（済み）

1. https://dashboard.render.com でログイン
2. 「New」→「Web Service」→ GitHubリポジトリを接続
3. 以下を設定:
   - Name: `drug-shortage-line-alert`
   - Region: Oregon (US West)
   - Branch: `master`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node scheduler.mjs`
   - Instance Type: **Starter**（常時起動が必須。Freeはcronが動かない）

## 環境変数

Renderの「Environment」タブで以下を設定する。

| 変数 | 値 | 備考 |
|------|-----|------|
| `GOOGLE_CLIENT_ID` | GCPコンソールから取得 | 必須 |
| `GOOGLE_CLIENT_SECRET` | GCPコンソールから取得 | 必須 |
| `GOOGLE_TOKENS_JSON` | `credentials/tokens.json` の中身をそのままペースト | 必須（ファイルの代わり） |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウント鍵(JSON)の中身をそのままペースト | **推奨（期限切れしない）** |
| `SPREADSHEET_ID` | スプレッドシートURLの `/d/XXXXX/edit` 部分 | 必須 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers から取得 | 必須 |
| `LINE_CHANNEL_SECRET` | LINE Developers から取得 | 必須 |
| `LINE_GROUP_ID` | Webhook経由で取得済みのもの | 必須 |
| `DASHBOARD_URL` | `https://drug-shortage-line-alert.onrender.com` | 任意（LINE通知のリンクに使用） |

> 補足: `GOOGLE_SERVICE_ACCOUNT_JSON` が設定されている場合は、OAuthトークンより優先して利用します（invalid_grant 対策）。

## 推奨: Service Account に切り替えて安定化

OAuthトークンは失効（`invalid_grant`）で停止しやすいため、常時稼働環境では Service Account を推奨します。

1. GCPでサービスアカウントを作成 → 鍵（JSON）を発行
2. スプレッドシートをサービスアカウントの `client_email` に **編集権限で共有**
3. Renderの環境変数 `GOOGLE_SERVICE_ACCOUNT_JSON` に鍵JSONを貼り付け
4. Renderで再デプロイ（Manual DeployでもOK）

## デプロイ方法

### 自動デプロイ（通常）

`master` ブランチにプッシュすると、Renderが自動でビルド・デプロイする。

```bash
git push origin master
```

ビルド完了まで1〜3分。Renderダッシュボードの「Events」タブで進捗を確認できる。

### 手動デプロイ

Renderダッシュボードで「Manual Deploy」→「Deploy latest commit」をクリック。

## デプロイ後の確認

```bash
curl https://drug-shortage-line-alert.onrender.com/health
```

正常時:
```json
{"status":"ok","sheets":"connected","items":516,"uptime":123.456}
```

異常時（503）:
```json
{"status":"degraded","sheets":"error","error":"...","uptime":123.456}
```

### チェックリスト

- [ ] `/health` が `status: ok` を返す
- [ ] `/api/status` が在庫品目数を返す
- [ ] `/api/today` が今日の変化を返す
- [ ] 管理画面（`/`）が表示される
- [ ] CSVアップロードが動作する
- [ ] 翌朝7:00 JSTに通知が届く（翌日確認）

## ヘルスチェック設定

Renderダッシュボード → Settings → Health Checks で以下を設定する。

- Path: `/health`
- 200が返ればOK、503が返れば異常

## トラブルシューティング

### Google Sheets API エラー

- `GOOGLE_TOKENS_JSON` が正しくペーストされているか確認
- トークンが期限切れの場合はローカルで `npm run auth` を再実行し、Renderの環境変数に新しいトークンを貼り直す

### 通知が7:00 JSTに届かない

- `scheduler.mjs` のcronに `timezone: "Asia/Tokyo"` が指定されているか確認
- Renderのログ（Dashboard → Logs）でcron発火のタイムスタンプを確認

### ヘルスチェック失敗

- `/health` が 503 を返す場合、Google Sheets API との接続に問題がある
- Renderダッシュボードの「Logs」タブで具体的なエラーメッセージを確認

### プロセスがスリープする

- Instance Typeが「Free」になっていないか確認
- 「Starter」以上でないとcronが動かない（15分でスリープするため）

## 注意事項

- **Freeプランに絶対にしないこと。** node-cronはプロセス常駐が前提。スリープすると毎日の通知が届かなくなる
- Dockerfileはリポジトリに含まれているが、現在のRenderはNode.jsネイティブビルドを使用。Dockerビルドに切り替える場合はSettings → Build & Deploy で変更する
