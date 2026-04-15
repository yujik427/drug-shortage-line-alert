# drug-shortage-line-alert — 出荷調整品 LINEアラート

調剤薬局の在庫品目を一度登録し、LINE BotをチームのLINEグループに招待するだけで、
出荷調整の変化（新規追加・解除）を毎日自動検知してグループ全員に届けるPush型通知サービス。

## コマンド一覧

```bash
npm install              # 依存関係インストール
npm start                # スケジューラー起動（00:00収集・07:00通知を自動実行）
npm run collect          # 手動で出荷調整情報を収集する
npm run notify           # 手動で差分チェック・通知を実行する
npm run auth             # Google OAuth 認証
npm run init             # スプレッドシート初期化（4シート作成）
```

## プロジェクト構成

```
drug-shortage-line-alert/
├── CLAUDE.md                  ← このファイル
├── package.json
├── .env                       ← 環境変数（Git管理外）
├── .env.example               ← 環境変数テンプレート
├── .gitignore
├── scheduler.mjs              ← 定期実行スケジューラー（node-cron）
├── auth-google.mjs            ← Google OAuth 認証フロー
├── mockup-onboarding.html     ← 見た目の正本①（オンボーディング3画面）
├── mockup-dashboard.html      ← 見た目の正本②（管理画面）
├── credentials/
│   └── tokens.json            ← Google認証トークン（Git管理外）
├── lib/
│   ├── sheets.mjs             ← スプレッドシート操作ヘルパー
│   └── line.mjs               ← LINE Messaging API ヘルパー
├── scrapers/
│   └── mhlw.mjs               ← 厚労省Excel取得・解析
├── jobs/
│   ├── collect.mjs            ← 出荷調整情報の収集（毎日00:00）
│   └── notify.mjs             ← 差分チェック・LINE通知（毎日07:00）
└── tools/
    ├── init-spreadsheet.mjs   ← スプシ初期化
    ├── test-line-push.mjs     ← LINE送信テスト
    ├── add-test-items.mjs     ← テスト用品目登録
    ├── webhook-server.mjs     ← グループID取得用（一時使用）
    └── debug-excel.mjs        ← Excel構造確認用（デバッグ）
```

## 4つのパーツ

| パーツ | 内容 |
|--------|------|
| トリガー | 毎日00:00に収集、毎日07:00に通知判定（node-cron） |
| ソース元 | 厚労省の出荷調整Excelファイル（日次更新）＋ 薬局登録品目 |
| 処理する場所 | Node.jsスクリプト（収集→スプシ保存→差分比較→通知文生成） |
| 届ける先 | 薬局チームの既存LINEグループ |

## データの流れ

```
厚労省Excel（16,000件以上の医薬品データ）
    ↓ 毎日00:00に取得
出荷調整DBシート（出荷調整中の品目だけ保存・前日と比較）
    ↓ 毎日07:00に照合
在庫品目シート × 出荷調整DB → 変化があった品目を抽出
    ↓
変化あり → LINEグループに通知
変化なし → Bot沈黙（通知しない）
```

## スプレッドシートのシート構成

| シート | 内容 | 誰が操作するか |
|--------|------|--------------|
| 薬局設定 | 薬局名・LINEグループIDなど | 初回のみ |
| 在庫品目 | 品目名・YJコード・在庫数・月間出庫数・登録日 | 薬剤師が登録・更新 |
| 出荷調整DB | 厚労省データの日次スナップショット | スクリプトが自動書き込み |
| 通知ログ | 送信日時・件数・内容・ステータス | スクリプトが自動記録 |

## 照合ロジック

- **YJコードがある品目** → コードで1対1の完全一致（確実）
- **YJコードがない品目** → 品名で部分一致（フォールバック）
- 登録日が空の品目は、通知実行時に自動で当日の日付を書き込む

## 通知フォーマット

### 変化あり（LINEに送信）
```
🔔 本日の出荷調整変更 2件

【新規】アムロジピン錠5mg「サワイ」
出荷調整対象となりました
②限定出荷（他社品の影響）/ 出荷量: B．出荷量減少
理由: ２．他社品の影響による需要増加
見込み: イ. 概ね1年以内に解除見込み

【解除】メトホルミン錠250mg「トーワ」
出荷調整が解除されました

詳細 → https://www.mhlw.go.jp/...
```

### 変化なし
Botは何も送信しない（沈黙＝変化なし）

### 上限処理
- 通知は最大10件まで詳細表示
- 超えた分は「…他N件（スプレッドシートで確認できます）」
- 初回収集時は変化種別を付けない（記録するだけ）

## 環境変数（.env）

```
GOOGLE_CLIENT_ID=             # Google OAuth クライアントID
GOOGLE_CLIENT_SECRET=         # Google OAuth クライアントシークレット
GOOGLE_TOKENS_PATH=           # トークン保存先
SPREADSHEET_ID=               # スプレッドシートID
LINE_CHANNEL_ACCESS_TOKEN=    # LINE Messaging APIアクセストークン
LINE_CHANNEL_SECRET=          # LINEチャンネルシークレット
LINE_GROUP_ID=                # 通知先LINEグループID
```

## よくあるエラーと対処法

| エラー | 原因 | 対処 |
|--------|------|------|
| `GOOGLE_CLIENT_ID が未設定` | .envが存在しないか値が空 | auth-google.mjsを実行 |
| `Token file not found` | Google認証が未完了 | `npm run auth` を実行 |
| `SPREADSHEET_ID が未設定` | .envにIDが入っていない | スプシURLからIDをコピーして.envに追加 |
| `LINE送信エラー (400)` | グループIDが間違っている | webhook-server.mjsでグループIDを再取得 |
| `Excelファイルのヘッダー構造を特定できません` | 厚労省がExcelの形式を変更した | scrapers/mhlw.mjsのヘッダー検出ロジックを修正 |

## 共通ルール

- ユーザー（薬局管理者）にファイルを直接編集させない
- エラーが起きたら、何が起きたか・次にすることを日本語で出力する
- Bot送信内容は変化品目の名称・状況・情報元リンクのみ（在庫数量などの機密情報は送らない）
