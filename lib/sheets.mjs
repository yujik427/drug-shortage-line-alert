/**
 * Google Sheets 認証・接続ヘルパー
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

export let SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const TOKENS_PATH =
  process.env.GOOGLE_TOKENS_PATH || join(PROJECT_ROOT, "credentials", "tokens.json");

if (process.env.GOOGLE_TOKENS_JSON && !existsSync(TOKENS_PATH)) {
  mkdirSync(dirname(TOKENS_PATH), { recursive: true });
  writeFileSync(TOKENS_PATH, process.env.GOOGLE_TOKENS_JSON, "utf-8");
}

/** Google OAuth 認証クライアントを作成する */
export function getAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("Error: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が .env に設定されていません");
    process.exit(1);
  }
  if (!existsSync(TOKENS_PATH)) {
    console.error(`Error: トークンファイルが見つかりません: ${TOKENS_PATH}`);
    console.error("以下を実行してください: node auth-google.mjs");
    process.exit(1);
  }
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials(tokens);
  return client;
}

let _sheets;

/** Sheets API のインスタンスを取得する */
export async function getSheets() {
  if (_sheets) return _sheets;
  if (!SPREADSHEET_ID) {
    console.error("Error: SPREADSHEET_ID が .env に設定されていません");
    process.exit(1);
  }
  const client = getAuthClient();
  _sheets = google.sheets({ version: "v4", auth: client });
  return _sheets;
}

/** スプレッドシートIDを .env に書き込む */
export function saveSpreadsheetId(newId) {
  const envPath = join(PROJECT_ROOT, ".env");
  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  if (envContent.match(/^SPREADSHEET_ID=.*$/m)) {
    envContent = envContent.replace(/^SPREADSHEET_ID=.*$/m, `SPREADSHEET_ID=${newId}`);
  } else {
    envContent += `\nSPREADSHEET_ID=${newId}\n`;
  }
  writeFileSync(envPath, envContent, "utf-8");
  SPREADSHEET_ID = newId;
  process.env.SPREADSHEET_ID = newId;
  _sheets = null;
}

/** シートの全データを読み取る */
export async function readSheet(sheetName, range = "A:Z") {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${range}`,
  });
  return res.data.values || [];
}

/** シートに行を追加する */
export async function appendRows(sheetName, rows) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

/** 特定のセルを更新する */
export async function updateCell(sheetName, cell, value) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${cell}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

/** シートの全データをクリアする（ヘッダー行は残す） */
export async function clearSheet(sheetName, startRow = 2) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A${startRow}:Z`,
  });
}

/** シートの全データを上書きする */
export async function writeSheet(sheetName, rows) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}
