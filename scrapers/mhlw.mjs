/**
 * 厚労省の出荷調整情報Excelファイルを取得・解析する
 *
 * データ元: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/kouhatu-iyaku/04_00003.html
 * Excelファイルには全医薬品の供給状況が記載されている
 *
 * 出荷対応の状況:
 *   通常出荷 / 限定出荷（自社の事情）/ 限定出荷（他社品の影響）/
 *   限定出荷（その他）/ 供給停止
 */

import XLSX from "xlsx";

const MHLW_PAGE_URL =
  "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/kouhatu-iyaku/04_00003.html";

/**
 * 厚労省ページからExcelファイルのURLを取得する
 * ファイル名は日付で変わるため、ページをパースして最新URLを探す
 */
async function findExcelUrl() {
  const res = await fetch(MHLW_PAGE_URL);
  if (!res.ok) throw new Error(`厚労省ページの取得に失敗 (${res.status})`);

  const html = await res.text();
  const match = html.match(/href="([^"]*iyakuhinkyoukyu\.xlsx)"/);
  if (!match) throw new Error("ExcelファイルのURLが見つかりませんでした");

  let url = match[1];
  if (url.startsWith("/")) {
    url = "https://www.mhlw.go.jp" + url;
  }
  return url;
}

/**
 * Excelファイルをダウンロードしてパースする
 * 返り値: [{ drugName, maker, status, isNew }, ...]
 */
export async function fetchShortageData() {
  console.log("厚労省ページからExcelファイルのURLを取得中...");
  const excelUrl = await findExcelUrl();
  console.log(`ExcelファイルURL: ${excelUrl}`);

  console.log("Excelファイルをダウンロード中...");
  const res = await fetch(excelUrl);
  if (!res.ok) throw new Error(`Excelファイルのダウンロードに失敗 (${res.status})`);

  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log(`取得行数: ${rows.length}`);

  // ヘッダー行を探す
  let headerIdx = -1;
  const col = {};

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.map((c) => String(c || "").trim());

    for (let j = 0; j < cells.length; j++) {
      if (cells[j].includes("YJコード")) col.yjCode = j;
      if (cells[j].includes("品名")) col.drugName = j;
      if (cells[j].includes("製造販売業者")) col.maker = j;
      if (cells[j].includes("出荷対応")) col.status = j;
      if (cells[j].includes("限定出荷") && cells[j].includes("理由")) col.reason = j;
      if (cells[j].includes("解除見込み") || cells[j].includes("解消見込み")) {
        if (!col.prospect) col.prospect = j;
      }
      if (cells[j].includes("出荷量") && cells[j].includes("現在")) col.volume = j;
      if (cells[j].includes("更新有無")) col.isNew = j;
    }

    if (col.drugName >= 0 && col.status >= 0) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    console.log("ヘッダー解析: 先頭行を表示します");
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      console.log(`  行${i}: ${JSON.stringify(rows[i])}`);
    }
    throw new Error("Excelファイルのヘッダー構造を特定できませんでした");
  }

  console.log(`ヘッダー行: ${headerIdx}, 品名: col${col.drugName}, YJ: col${col.yjCode}, 出荷対応: col${col.status}`);

  const cell = (row, key) => key in col ? String(row[col[key]] || "").trim() : "";

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[col.drugName]) continue;

    const drugName = cell(row, "drugName");
    if (!drugName) continue;

    records.push({
      yjCode: cell(row, "yjCode"),
      drugName,
      maker: cell(row, "maker"),
      status: cell(row, "status"),
      reason: cell(row, "reason"),
      prospect: cell(row, "prospect"),
      volume: cell(row, "volume"),
      isNew: cell(row, "isNew"),
    });
  }

  console.log(`解析完了: ${records.length}件の医薬品データ`);
  return records;
}

/**
 * ステータスが「出荷調整中」に該当するか判定
 */
export function isShortage(status) {
  if (!status) return false;
  const s = String(status);
  return (
    s.includes("限定出荷") ||
    s.includes("供給停止") ||
    s.includes("出荷停止")
  );
}
