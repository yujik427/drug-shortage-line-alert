/**
 * LINE Messaging API ヘルパー
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const GROUP_ID = process.env.LINE_GROUP_ID;

// ─── 厚労省コード → 薬剤師向け日本語の変換 ───

export function cleanStatus(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("供給停止")) return "供給停止";
  if (s.includes("出荷停止")) return "出荷停止";
  if (s.includes("限定出荷") && s.includes("自社")) return "限定出荷（自社事情）";
  if (s.includes("限定出荷") && s.includes("他社")) return "限定出荷（他社品の影響）";
  if (s.includes("限定出荷")) return "限定出荷";
  return s.replace(/^[①-⑳\d０-９]+[.．)\s]*/g, "").trim();
}

export function cleanVolume(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (/[－\-]/.test(s) && s.length < 5) return "";
  return s.replace(/^[A-Eａ-ｅＡ-Ｅ][.．)\s]*/g, "").trim();
}

export function cleanReason(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (/[－\-]/.test(s) && s.length < 5) return "";
  return s.replace(/^[０-９\d]+[.．)\s]*/g, "").trim();
}

export function cleanProspect(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (/[－\-]/.test(s) && s.length < 5) return "";
  return s
    .replace(/^[ア-ンa-zA-Zａ-ｚＡ-Ｚ][.．)\s]*/g, "")
    .replace(/^概ね/g, "")
    .trim();
}

/** LINEグループにテキストメッセージを送信する */
export async function pushMessage(text, groupId = GROUP_ID) {
  if (!TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN が .env に設定されていません");
  }
  if (!groupId) {
    throw new Error("LINE_GROUP_ID が .env に設定されていません");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE送信エラー (${res.status}): ${body}`);
  }

  return true;
}

/** 出荷調整の変化をLINE通知フォーマットに変換して送信する */
export async function sendShortageAlert(changes, { groupId = GROUP_ID, overflow = 0 } = {}) {
  if (changes.length === 0) return false;

  const totalCount = changes.length + overflow;
  const typeOrder = { "新規": 0, "変更": 1, "解除": 2 };
  const sorted = [...changes].sort(
    (a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
  );

  let text = `本日の出荷調整変更 ${totalCount}件\n`;

  let currentType = null;
  for (const change of sorted) {
    if (change.type !== currentType) {
      currentType = change.type;
      text += `\n━ ${currentType} ━━━━━━━━━━━\n`;
    }

    text += `\n▶ ${change.drugName}\n`;

    if (change.type === "解除") {
      text += "  出荷調整が解除されました\n";
      continue;
    }

    const status = cleanStatus(change.status);
    const volume = cleanVolume(change.volume);
    const reason = cleanReason(change.reason);
    const prospect = cleanProspect(change.prospect);

    const statusLine = [status, volume].filter(Boolean).join("（") + (volume ? "）" : "");
    if (statusLine) text += `  ${statusLine}\n`;
    if (reason) text += `  理由: ${reason}\n`;
    if (prospect) text += `  見込み: ${prospect}\n`;
  }

  if (overflow > 0) {
    text += `\n…他 ${overflow}件はスプレッドシートで確認できます\n`;
  }

  const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3010";
  text += `\n確認 → ${dashboardUrl}`;

  await pushMessage(text.trim(), groupId);
  return true;
}
