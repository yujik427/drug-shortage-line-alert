#!/usr/bin/env node

/**
 * CSVファイルから在庫品目をスプレッドシートに一括登録する
 *
 * 使い方:
 *   node tools/import-csv.mjs data/inventory.csv
 *   node tools/import-csv.mjs data/inventory.csv --replace   ← 既存データを置き換え
 */

import { readFileSync } from "fs";
import { readSheet, writeSheet, appendRows } from "../lib/sheets.mjs";

const SHEET_NAME = "在庫品目";

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    if (values[0]) rows.push(values);
  }

  return { headers, rows };
}

function findColumn(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(
      (h) => h === c || h.includes(c)
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const replaceMode = args.includes("--replace");

  if (!csvPath) {
    console.log("使い方: node tools/import-csv.mjs <CSVファイルパス> [--replace]");
    console.log("");
    console.log("  --replace  既存の品目をすべて置き換える（省略時は追加）");
    console.log("");
    console.log("CSVの形式（ヘッダー行必須）:");
    console.log("  品目名,YJコード,在庫数,月間出庫数");
    console.log("  アムロジピン錠5mg「サワイ」,2171022F1243,500,120");
    process.exit(1);
  }

  const raw = readFileSync(csvPath, "utf-8").replace(/^\uFEFF/, "");
  const { headers, rows } = parseCSV(raw);

  if (rows.length === 0) {
    console.error("CSVにデータ行がありません");
    process.exit(1);
  }

  const nameIdx = findColumn(headers, ["品目名", "品名", "薬品名", "医薬品名", "名称"]);
  const yjIdx = findColumn(headers, ["YJコード", "YJ", "YJcode", "薬価コード"]);
  const stockIdx = findColumn(headers, ["在庫数", "在庫", "現在庫", "数量", "在庫量"]);
  const usageIdx = findColumn(headers, ["月間出庫数", "出庫数", "払出数", "使用量", "消費量", "出庫", "払出"]);

  if (nameIdx < 0) {
    console.error("品目名の列が見つかりません。ヘッダーに「品目名」「品名」「薬品名」のいずれかを含めてください");
    console.error(`現在のヘッダー: ${headers.join(", ")}`);
    process.exit(1);
  }

  console.log(`CSVを読み込みました: ${rows.length}件`);
  console.log(`  品目名の列: ${headers[nameIdx]}（${nameIdx + 1}列目）`);
  if (yjIdx >= 0) {
    console.log(`  YJコードの列: ${headers[yjIdx]}（${yjIdx + 1}列目）`);
  } else {
    console.log("  YJコードの列: なし（品名照合になります）");
  }
  if (stockIdx >= 0) console.log(`  在庫数の列: ${headers[stockIdx]}（${stockIdx + 1}列目）`);
  if (usageIdx >= 0) console.log(`  月間出庫数の列: ${headers[usageIdx]}（${usageIdx + 1}列目）`);

  const today = new Date().toISOString().split("T")[0];
  const sheetRows = rows.map((row) => [
    row[nameIdx] || "",
    yjIdx >= 0 ? (row[yjIdx] || "") : "",
    stockIdx >= 0 ? (row[stockIdx] || "") : "",
    usageIdx >= 0 ? (row[usageIdx] || "") : "",
    today,
  ]);

  if (replaceMode) {
    const allRows = [["品目名", "YJコード", "在庫数", "月間出庫数", "登録日"], ...sheetRows];
    await writeSheet(SHEET_NAME, allRows);
    console.log(`\n${sheetRows.length}件を在庫品目シートに登録しました（既存データは置き換え）`);
  } else {
    const existing = await readSheet(SHEET_NAME);
    const existingCount = Math.max(0, existing.length - 1);
    await appendRows(SHEET_NAME, sheetRows);
    console.log(`\n${sheetRows.length}件を在庫品目シートに追加しました（既存 ${existingCount}件 + 追加 ${sheetRows.length}件 = 計 ${existingCount + sheetRows.length}件）`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
