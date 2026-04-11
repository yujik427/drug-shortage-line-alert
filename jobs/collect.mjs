#!/usr/bin/env node

/**
 * 出荷調整情報の収集ジョブ
 *
 * 厚労省のExcelファイルをダウンロードし、
 * スプレッドシートの「出荷調整DB」シートに書き込む
 *
 * 毎日00:00に実行する想定
 */

import { fetchShortageData, isShortage } from "../scrapers/mhlw.mjs";
import { writeSheet, readSheet } from "../lib/sheets.mjs";

const SHEET_NAME = "出荷調整DB";

async function main() {
  console.log("=== 出荷調整情報の収集を開始 ===");
  console.log(`実行日時: ${new Date().toLocaleString("ja-JP")}`);
  console.log("");

  // 1. 現在のDBシートを読み取る（前回データとして保持）
  console.log("前回データを読み取り中...");
  const prevRows = await readSheet(SHEET_NAME);
  const prevMap = new Map();
  if (prevRows.length > 1) {
    for (let i = 1; i < prevRows.length; i++) {
      const row = prevRows[i];
      const drugName = (row[0] || "").trim();
      if (drugName) prevMap.set(drugName, { status: row[1] || "", yjCode: row[6] || "" });
    }
  }
  const isFirstRun = prevMap.size === 0;
  if (isFirstRun) {
    console.log("初回収集です。今の状態を記録し、変化種別は付けません。");
  }
  console.log(`前回データ: ${prevMap.size}件`);

  // 2. 厚労省からデータを取得
  const records = await fetchShortageData();

  // 3. 出荷調整に関係するデータだけ抽出
  const shortageRecords = records.filter((r) => isShortage(r.status));
  console.log(`出荷調整中の品目: ${shortageRecords.length}件`);

  // 4. スプレッドシートに書き込む
  const today = new Date().toISOString().split("T")[0];
  const SOURCE_URL = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/kouhatu-iyaku/04_00003.html";
  const rows = [
    ["薬品名", "ステータス", "変化種別", "情報元URL", "記録日", "前回ステータス", "YJコード", "理由", "解除見込み", "出荷量"],
  ];

  for (const record of shortageRecords) {
    const prev = prevMap.get(record.drugName);
    const prevStatus = prev ? prev.status : "";
    let changeType = "";

    // 初回は変化種別を付けない（今の状態を覚えるだけ）
    if (!isFirstRun) {
      if (!prevStatus || prevStatus === "通常出荷") {
        changeType = "新規";
      } else if (prevStatus !== record.status) {
        changeType = "変更";
      }
    }

    rows.push([
      record.drugName,
      record.status,
      changeType,
      SOURCE_URL,
      today,
      prevStatus,
      record.yjCode,
      record.reason,
      record.prospect,
      record.volume,
    ]);
  }

  // 前回は出荷調整だったが今回は通常出荷に戻った品目
  const currentDrugNames = new Set(shortageRecords.map((r) => r.drugName));
  for (const [drugName, prev] of prevMap) {
    if (isShortage(prev.status) && !currentDrugNames.has(drugName)) {
      rows.push([
        drugName,
        "通常出荷",
        "解除",
        SOURCE_URL,
        today,
        prev.status,
        prev.yjCode,
        "",
        "",
        "",
      ]);
    }
  }

  console.log(`書き込み行数: ${rows.length - 1}件`);
  await writeSheet(SHEET_NAME, rows);

  console.log("");
  console.log("=== 収集完了 ===");

  const newCount = rows.filter((r) => r[2] === "新規").length - 0;
  const releasedCount = rows.filter((r) => r[2] === "解除").length;
  const changedCount = rows.filter((r) => r[2] === "変更").length;
  console.log(`新規: ${newCount}件 / 解除: ${releasedCount}件 / 変更: ${changedCount}件`);
}

main().catch((err) => {
  console.error("収集エラー:", err.message);
  process.exit(1);
});
