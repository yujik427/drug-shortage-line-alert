#!/usr/bin/env node

/**
 * 差分チェック・LINE通知ジョブ
 *
 * 「在庫品目」シートに登録された品目と「出荷調整DB」シートを突き合わせ、
 * 変化があった品目だけLINEグループに通知する
 *
 * 毎日07:00に実行する想定
 */

import { readSheet, appendRows, updateCell } from "../lib/sheets.mjs";
import { sendShortageAlert } from "../lib/line.mjs";

const ITEMS_SHEET = "在庫品目";
const DB_SHEET = "出荷調整DB";
const LOG_SHEET = "通知ログ";

async function main() {
  console.log("=== 差分チェック・LINE通知を開始 ===");
  console.log(`実行日時: ${new Date().toLocaleString("ja-JP")}`);
  console.log("");

  // 1. 在庫品目を読み取る（YJコードがあればコード照合、なければ品名照合）
  console.log("在庫品目を読み取り中...");
  const itemRows = await readSheet(ITEMS_SHEET);
  const registeredItems = [];
  const today = new Date().toISOString().split("T")[0];
  if (itemRows.length > 1) {
    for (let i = 1; i < itemRows.length; i++) {
      const name = (itemRows[i][0] || "").trim();
      const yjCode = (itemRows[i][1] || "").trim();
      // C=在庫数, D=月間出庫数 はここでは使わない（scheduler側で参照）
      const regDate = (itemRows[i][4] || "").trim();

      if (!name && !yjCode) continue;
      registeredItems.push({ name, yjCode });

      if (!regDate) {
        await updateCell(ITEMS_SHEET, `E${i + 1}`, today);
      }
    }
  }
  const withCode = registeredItems.filter((i) => i.yjCode).length;
  const withName = registeredItems.length - withCode;
  console.log(`登録品目数: ${registeredItems.length}件（YJコード: ${withCode}件 / 品名のみ: ${withName}件）`);

  if (registeredItems.length === 0) {
    console.log("在庫品目が未登録です。通知をスキップします。");
    return;
  }

  // 2. 出荷調整DBを読み取る
  console.log("出荷調整DBを読み取り中...");
  const dbRows = await readSheet(DB_SHEET);
  const dbRecords = [];
  if (dbRows.length > 1) {
    for (let i = 1; i < dbRows.length; i++) {
      const row = dbRows[i];
      if (row[0]) {
        dbRecords.push({
          drugName: row[0] || "",
          status: row[1] || "",
          changeType: row[2] || "",
          sourceUrl: row[3] || "",
          recordDate: row[4] || "",
          prevStatus: row[5] || "",
          yjCode: row[6] || "",
          reason: row[7] || "",
          prospect: row[8] || "",
          volume: row[9] || "",
        });
      }
    }
  }
  console.log(`出荷調整DB: ${dbRecords.length}件`);

  // 3. 照合（YJコード優先 → 品名フォールバック）
  const changes = [];
  const alreadyMatched = new Set();

  for (const item of registeredItems) {
    let matched;

    if (item.yjCode) {
      // YJコードで完全一致
      matched = dbRecords.filter(
        (r) => r.changeType && r.yjCode === item.yjCode
      );
    } else {
      // 品名で部分一致（フォールバック）
      matched = dbRecords.filter(
        (r) => r.changeType && r.drugName.includes(item.name)
      );
    }

    for (const record of matched) {
      const key = `${record.yjCode || record.drugName}`;
      if (alreadyMatched.has(key)) continue;
      alreadyMatched.add(key);

      changes.push({
        type: record.changeType,
        drugName: record.drugName,
        status: record.status,
        reason: record.reason,
        prospect: record.prospect,
        volume: record.volume,
        sourceUrl: record.sourceUrl,
      });
    }
  }

  console.log(`変化のあった登録品目: ${changes.length}件`);

  // 4. 件数が多すぎる場合は上限を設けて残りは件数だけ伝える
  const MAX_DETAIL = 10;
  let overflow = 0;
  if (changes.length > MAX_DETAIL) {
    overflow = changes.length - MAX_DETAIL;
    console.log(`通知上限 ${MAX_DETAIL}件を超えたため、${overflow}件は件数のみ通知します`);
    changes.length = MAX_DETAIL;
  }

  // 5. 変化があればLINE通知
  if (changes.length === 0) {
    console.log("");
    console.log("変化なし → Bot沈黙（通知送信なし）");

    // ログに「変化なし」を記録
    await appendRows(LOG_SHEET, [
      [new Date().toLocaleString("ja-JP"), "0", "変化なし（Bot沈黙）", "成功"],
    ]);
    console.log("通知ログに記録しました。");
    return;
  }

  console.log("LINE通知を送信中...");
  try {
    await sendShortageAlert(changes, { overflow });
    console.log("送信成功！");

    // ログに記録
    const totalCount = changes.length + overflow;
    const summary = changes.map((c) => `【${c.type}】${c.drugName}`).join("\n")
      + (overflow > 0 ? `\n…他 ${overflow}件` : "");
    await appendRows(LOG_SHEET, [
      [new Date().toLocaleString("ja-JP"), String(totalCount), summary, "成功"],
    ]);
    console.log("通知ログに記録しました。");
  } catch (err) {
    console.error("LINE送信エラー:", err.message);

    await appendRows(LOG_SHEET, [
      [new Date().toLocaleString("ja-JP"), String(changes.length), err.message, "失敗"],
    ]);
  }

  console.log("");
  console.log("=== 通知処理完了 ===");
}

main().catch((err) => {
  console.error("通知エラー:", err.message);
  process.exit(1);
});
