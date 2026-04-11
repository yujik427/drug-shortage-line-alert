#!/usr/bin/env node

import XLSX from "xlsx";

const url = "https://www.mhlw.go.jp/content/10800000/260410iyakuhinkyoukyu.xlsx";

async function main() {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  console.log("シート名:", workbook.SheetNames);

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log(`\n全行数: ${rows.length}`);
  console.log("\n先頭15行:");
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    console.log(`行${i}: ${JSON.stringify(rows[i])}`);
  }
}

main().catch(console.error);
