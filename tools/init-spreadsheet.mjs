#!/usr/bin/env node

/**
 * スプレッドシート接続テスト＆初期シート作成
 * 必要な4つのシートとヘッダーを自動で作る
 */

import { getSheets, SPREADSHEET_ID } from "../lib/sheets.mjs";

const REQUIRED_SHEETS = [
  {
    name: "薬局設定",
    headers: ["薬局名", "メールアドレス", "LINEグループID", "プラン", "トライアル終了日"],
  },
  {
    name: "在庫品目",
    headers: ["品目名", "YJコード", "在庫数", "月間出庫数", "登録日"],
  },
  {
    name: "出荷調整DB",
    headers: ["薬品名", "ステータス", "変化種別", "情報元URL", "記録日", "前回ステータス"],
  },
  {
    name: "通知ログ",
    headers: ["送信日時", "変化件数", "送信内容", "ステータス"],
  },
];

async function main() {
  if (!SPREADSHEET_ID) {
    console.error("Error: SPREADSHEET_ID が .env に設定されていません");
    process.exit(1);
  }

  console.log(`接続テスト中... (ID: ${SPREADSHEET_ID})`);
  const sheets = await getSheets();

  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  console.log(`✓ 接続成功: 「${res.data.properties.title}」`);

  const existingSheets = res.data.sheets.map((s) => s.properties.title);
  console.log(`  既存シート: ${existingSheets.join(", ")}`);

  for (const { name, headers } of REQUIRED_SHEETS) {
    if (existingSheets.includes(name)) {
      console.log(`✓ シート「${name}」は既にあります`);
      continue;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: name } } }],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${name}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });

    console.log(`✓ シート「${name}」を作成しました`);
  }

  // デフォルトの「シート1」を削除（他のシートがある場合のみ）
  if (existingSheets.includes("シート1")) {
    const sheet1 = res.data.sheets.find((s) => s.properties.title === "シート1");
    if (sheet1) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }],
          },
        });
        console.log(`✓ 不要な「シート1」を削除しました`);
      } catch {
        // シートが1枚しかない場合は削除できないので無視
      }
    }
  }

  console.log("");
  console.log("セットアップ完了！ スプレッドシートに4つのシートが準備できました。");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
