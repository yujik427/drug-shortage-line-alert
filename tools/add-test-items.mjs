#!/usr/bin/env node

/**
 * テスト用の在庫品目を登録する
 */

import { writeSheet } from "../lib/sheets.mjs";

const SHEET_NAME = "在庫品目";

async function main() {
  const today = new Date().toISOString().split("T")[0];

  await writeSheet(SHEET_NAME, [
    ["品目名", "YJコード", "登録日"],
    ["アムロジピンＯＤ錠5mg「サワイ」", "2171022F5039", today],
    ["メトホルミン錠250mgMT「DSPB」", "3962001F1164", today],
    ["ロスバスタチン", "", today],
  ]);

  console.log("テスト用の在庫品目を3件登録しました");
  console.log("  - アムロジピンＯＤ錠5mg「サワイ」（YJコードあり → コード照合）");
  console.log("  - メトホルミン錠250mgMT「DSPB」（YJコードあり → コード照合）");
  console.log("  - ロスバスタチン（YJコードなし → 品名照合）");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
