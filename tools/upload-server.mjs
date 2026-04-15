#!/usr/bin/env node

/**
 * CSVアップロード用ローカルサーバー
 * ブラウザでCSVをドラッグ＆ドロップ → スプレッドシートに自動登録
 *
 * 使い方: node tools/upload-server.mjs
 * ブラウザで http://localhost:3010 を開く
 */

import { createServer } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readSheet, writeSheet, appendRows } from "../lib/sheets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3010;
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
    const idx = headers.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

async function handleUpload(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "不正なリクエストです" }));
    return;
  }

  const { csvText, mode } = payload;
  if (!csvText) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "CSVデータがありません" }));
    return;
  }

  const cleaned = csvText.replace(/^\uFEFF/, "");
  const { headers, rows } = parseCSV(cleaned);

  if (rows.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "CSVにデータ行がありません" }));
    return;
  }

  const nameIdx = findColumn(headers, ["品目名", "品名", "薬品名", "医薬品名", "名称"]);
  const yjIdx = findColumn(headers, ["YJコード", "YJ", "YJcode", "薬価コード"]);
  const stockIdx = findColumn(headers, ["在庫数", "在庫", "現在庫", "数量", "在庫量"]);
  const usageIdx = findColumn(headers, ["月間出庫数", "出庫数", "払出数", "使用量", "消費量", "出庫", "払出"]);

  if (nameIdx < 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `品目名の列が見つかりません。ヘッダーに「品目名」「品名」「薬品名」のいずれかを含めてください。現在のヘッダー: ${headers.join(", ")}`,
      })
    );
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const sheetRows = rows.map((row) => [
    row[nameIdx] || "",
    yjIdx >= 0 ? row[yjIdx] || "" : "",
    stockIdx >= 0 ? row[stockIdx] || "" : "",
    usageIdx >= 0 ? row[usageIdx] || "" : "",
    today,
  ]);

  try {
    if (mode === "replace") {
      const allRows = [["品目名", "YJコード", "在庫数", "月間出庫数", "登録日"], ...sheetRows];
      await writeSheet(SHEET_NAME, allRows);
    } else {
      await appendRows(SHEET_NAME, sheetRows);
    }

    const existing = await readSheet(SHEET_NAME);
    const totalCount = Math.max(0, existing.length - 1);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        imported: sheetRows.length,
        total: totalCount,
        hasYJ: yjIdx >= 0,
      })
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `スプレッドシートへの書き込みに失敗しました: ${err.message}` }));
  }
}

async function handleStatus(req, res) {
  try {
    const rows = await readSheet(SHEET_NAME);
    const count = Math.max(0, rows.length - 1);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count }));
  } catch {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: 0 }));
  }
}

const htmlPath = join(__dirname, "..", "upload.html");

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = readFileSync(htmlPath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && req.url === "/api/status") {
    await handleStatus(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/upload") {
    await handleUpload(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  在庫品目 CSVアップロード サーバー起動       ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  ブラウザで開く → http://localhost:${PORT}       ║`);
  console.log("║  終了するには Ctrl+C                         ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
});
