#!/usr/bin/env node

/**
 * 定期実行スケジューラー + 管理画面サーバー
 *
 * 毎日00:00 → 出荷調整情報を収集（collect）
 * 毎日07:00 → 差分チェック・LINE通知（notify）
 * 常時 → http://localhost:3010 で在庫品目アップロード画面
 *
 * 起動: node scheduler.mjs
 * 停止: Ctrl+C
 */

import { execFile } from "child_process";
import { createServer } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { readSheet, writeSheet, appendRows, getAuthMode } from "./lib/sheets.mjs";
import { cleanStatus, cleanVolume, cleanReason, cleanProspect } from "./lib/line.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3010;
const ITEMS_SHEET = "在庫品目";
const DB_SHEET = "出荷調整DB";

// ─── ジョブ実行 ───

function runJob(scriptPath, jobName) {
  const startTime = new Date().toLocaleString("ja-JP");
  console.log(`[${startTime}] ${jobName} を開始...`);

  return new Promise((resolve) => {
    execFile("node", [scriptPath], { cwd: __dirname }, (error, stdout, stderr) => {
      const endTime = new Date().toLocaleString("ja-JP");
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      if (error) {
        console.error(`[${endTime}] ${jobName} が失敗しました: ${error.message}`);
      } else {
        console.log(`[${endTime}] ${jobName} が完了しました`);
      }
      console.log("---");
      resolve();
    });
  });
}

cron.schedule("0 0 * * *", () => {
  runJob(join(__dirname, "jobs", "collect.mjs"), "出荷調整情報の収集");
}, { timezone: "Asia/Tokyo" });

cron.schedule("0 7 * * *", () => {
  runJob(join(__dirname, "jobs", "notify.mjs"), "差分チェック・LINE通知");
}, { timezone: "Asia/Tokyo" });

// ─── CSVアップロードサーバー ───

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
  try { payload = JSON.parse(body); } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "不正なリクエストです" }));
  }

  const { csvText, mode } = payload;
  if (!csvText) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "CSVデータがありません" }));
  }

  const cleaned = csvText.replace(/^\uFEFF/, "");
  const { headers, rows } = parseCSV(cleaned);

  if (rows.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "CSVにデータ行がありません" }));
  }

  const nameIdx = findColumn(headers, ["品目名", "品名", "薬品名", "医薬品名", "名称"]);
  const yjIdx = findColumn(headers, ["YJコード", "YJ", "YJcode", "薬価コード"]);
  const stockIdx = findColumn(headers, ["在庫数", "在庫", "現在庫", "数量", "在庫量"]);
  const usageIdx = findColumn(headers, ["月間出庫数", "出庫数", "払出数", "使用量", "消費量", "出庫", "払出"]);

  if (nameIdx < 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      error: `品目名の列が見つかりません。ヘッダーに「品目名」「品名」「薬品名」のいずれかを含めてください。現在のヘッダー: ${headers.join(", ")}`,
    }));
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
      await writeSheet(ITEMS_SHEET, [["品目名", "YJコード", "在庫数", "月間出庫数", "登録日"], ...sheetRows]);
    } else {
      await appendRows(ITEMS_SHEET, sheetRows);
    }
    const existing = await readSheet(ITEMS_SHEET);
    const totalCount = Math.max(0, existing.length - 1);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, imported: sheetRows.length, total: totalCount, hasYJ: yjIdx >= 0 }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `スプレッドシートへの書き込みに失敗しました: ${err.message}` }));
  }
}

async function handleStatus(req, res) {
  try {
    const rows = await readSheet(ITEMS_SHEET);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: Math.max(0, rows.length - 1) }));
  } catch {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: 0 }));
  }
}

// ─── 出荷調整DBの読み取りヘルパー ───

async function loadDbRecords() {
  const dbRows = await readSheet(DB_SHEET);
  const records = [];
  if (dbRows.length > 1) {
    for (let i = 1; i < dbRows.length; i++) {
      const row = dbRows[i];
      if (!row[0]) continue;
      records.push({
        drugName: (row[0] || "").trim(),
        status: (row[1] || "").trim(),
        changeType: (row[2] || "").trim(),
        recordDate: (row[4] || "").trim(),
        prevStatus: (row[5] || "").trim(),
        yjCode: (row[6] || "").trim(),
        reason: (row[7] || "").trim(),
        prospect: (row[8] || "").trim(),
        volume: (row[9] || "").trim(),
      });
    }
  }
  return records;
}

const DEFAULT_STOCK_THRESHOLD = 100;

async function loadItems() {
  const itemRows = await readSheet(ITEMS_SHEET);
  const items = [];
  if (itemRows.length > 1) {
    for (let i = 1; i < itemRows.length; i++) {
      const name = (itemRows[i][0] || "").trim();
      const yjCode = (itemRows[i][1] || "").trim();
      const stockRaw = (itemRows[i][2] || "").trim();
      const usageRaw = (itemRows[i][3] || "").trim();
      const regDate = (itemRows[i][4] || "").trim();
      if (!name && !yjCode) continue;
      const stock = stockRaw ? parseFloat(stockRaw) : null;
      const monthlyUsage = usageRaw ? parseFloat(usageRaw) : null;
      items.push({
        name, yjCode, regDate,
        stock: Number.isNaN(stock) ? null : stock,
        monthlyUsage: Number.isNaN(monthlyUsage) ? null : monthlyUsage,
      });
    }
  }
  return items;
}

function calcStockDays(stock, monthlyUsage) {
  if (stock === null) return null;
  if (monthlyUsage === null || monthlyUsage <= 0) return null;
  return Math.round(stock / (monthlyUsage / 30));
}

function calcUrgency(shortageStatus, stock, monthlyUsage) {
  if (shortageStatus === "normal") return "safe";
  const days = calcStockDays(stock, monthlyUsage);
  if (days !== null) {
    if (days <= 7) return "critical";
    if (days <= 14) return "warning";
    return "safe";
  }
  if (stock !== null && stock <= DEFAULT_STOCK_THRESHOLD) return "critical";
  if (stock !== null) return "warning";
  return "warning";
}

function isShortageStatus(status) {
  if (!status) return false;
  const s = String(status);
  return s.includes("限定出荷") || s.includes("供給停止") || s.includes("出荷停止");
}

// ─── /api/today ───

async function handleToday(req, res) {
  try {
    const items = await loadItems();
    const dbRecords = await loadDbRecords();
    const alreadyMatched = new Set();
    const changes = [];

    for (const item of items) {
      let matched;
      if (item.yjCode) {
        matched = dbRecords.filter((r) => r.changeType && r.yjCode === item.yjCode);
      } else {
        matched = dbRecords.filter((r) => r.changeType && r.drugName.includes(item.name));
      }

      for (const record of matched) {
        const key = record.yjCode || record.drugName;
        if (alreadyMatched.has(key)) continue;
        alreadyMatched.add(key);

        const shortageStatus = isShortageStatus(record.status)
          ? (record.status.includes("供給停止") || record.status.includes("出荷停止") ? "stopped" : "limited")
          : "normal";
        const urgency = record.changeType === "解除" ? "safe" : calcUrgency(shortageStatus, item.stock, item.monthlyUsage);
        const stockDays = calcStockDays(item.stock, item.monthlyUsage);

        changes.push({
          type: record.changeType,
          drugName: record.drugName,
          registeredName: item.name,
          stock: item.stock,
          monthlyUsage: item.monthlyUsage,
          stockDays,
          urgency,
          status: cleanStatus(record.status),
          volume: cleanVolume(record.volume),
          reason: cleanReason(record.reason),
          prospect: cleanProspect(record.prospect),
        });
      }
    }

    const typeOrder = { "新規": 0, "変更": 1, "解除": 2 };
    changes.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      date: new Date().toISOString().split("T")[0],
      total: changes.length,
      newCount: changes.filter((c) => c.type === "新規").length,
      changedCount: changes.filter((c) => c.type === "変更").length,
      releasedCount: changes.filter((c) => c.type === "解除").length,
      changes,
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ─── /api/items ───

async function handleItems(req, res) {
  try {
    const items = await loadItems();
    const dbRecords = await loadDbRecords();

    const dbMap = new Map();
    for (const r of dbRecords) {
      if (r.yjCode) dbMap.set(`yj:${r.yjCode}`, r);
      dbMap.set(`name:${r.drugName}`, r);
    }

    const result = items.map((item) => {
      let matched = null;
      if (item.yjCode) {
        matched = dbMap.get(`yj:${item.yjCode}`);
      }
      if (!matched) {
        for (const [key, r] of dbMap) {
          if (key.startsWith("name:") && r.drugName.includes(item.name)) {
            matched = r;
            break;
          }
        }
      }

      let shortageStatus = "normal";
      let statusLabel = "正常出荷";
      let changeType = "";

      if (matched) {
        if (isShortageStatus(matched.status)) {
          statusLabel = cleanStatus(matched.status);
          shortageStatus = matched.status.includes("供給停止") || matched.status.includes("出荷停止")
            ? "stopped" : "limited";
        } else {
          statusLabel = "正常出荷";
        }
        changeType = matched.changeType || "";
      }

      const urgency = calcUrgency(shortageStatus, item.stock, item.monthlyUsage);
      const stockDays = calcStockDays(item.stock, item.monthlyUsage);

      return {
        name: item.name,
        yjCode: item.yjCode,
        regDate: item.regDate,
        stock: item.stock,
        monthlyUsage: item.monthlyUsage,
        stockDays,
        shortageStatus,
        statusLabel,
        changeType,
        urgency,
        reason: matched ? cleanReason(matched.reason) : "",
        prospect: matched ? cleanProspect(matched.prospect) : "",
        volume: matched ? cleanVolume(matched.volume) : "",
      };
    });

    const stoppedCount = result.filter((r) => r.shortageStatus === "stopped").length;
    const limitedCount = result.filter((r) => r.shortageStatus === "limited").length;
    const normalCount = result.filter((r) => r.shortageStatus === "normal").length;
    const criticalCount = result.filter((r) => r.urgency === "critical").length;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      total: result.length,
      stoppedCount,
      limitedCount,
      normalCount,
      criticalCount,
      items: result,
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

const htmlPath = join(__dirname, "dashboard.html");

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = readFileSync(htmlPath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }
  if (req.method === "GET" && req.url === "/api/status") return handleStatus(req, res);
  if (req.method === "GET" && req.url === "/api/today") return handleToday(req, res);
  if (req.method === "GET" && req.url === "/api/items") return handleItems(req, res);
  if (req.method === "POST" && req.url === "/api/upload") return handleUpload(req, res);

  if (req.method === "GET" && req.url === "/health") {
    try {
      const rows = await readSheet(ITEMS_SHEET);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        status: "ok",
        sheets: "connected",
        auth: getAuthMode(),
        items: Math.max(0, rows.length - 1),
        uptime: process.uptime(),
      }));
    } catch (err) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        status: "degraded",
        sheets: "error",
        auth: getAuthMode(),
        error: err.message,
        uptime: process.uptime(),
      }));
    }
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT);

// ─── 起動メッセージ ───

console.log("=== 出荷調整アラート 起動完了 ===");
console.log(`起動日時: ${new Date().toLocaleString("ja-JP")}`);
console.log("");
console.log("スケジュール:");
console.log("  毎日 00:00 → 出荷調整情報を収集");
console.log("  毎日 07:00 → 差分チェック・LINE通知");
console.log("");
console.log(`管理画面: http://localhost:${PORT}`);
console.log("---");
