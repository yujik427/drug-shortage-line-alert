#!/usr/bin/env node

/**
 * LINE通知のテスト送信
 * 新フォーマット（グループ化＋コード翻訳）のダミーデータを送る
 */

import { pushMessage, sendShortageAlert } from "../lib/line.mjs";

async function main() {
  console.log("LINE通知テストを開始します...");

  console.log("1. 新フォーマットで通知テスト送信中...");
  await sendShortageAlert([
    {
      type: "新規",
      drugName: "アムロジピンOD錠5mg「サワイ」",
      status: "②限定出荷（他社品の影響）",
      volume: "B．出荷量減少",
      reason: "２．他社品の影響による需要増加",
      prospect: "イ. 概ね1年以内に解除見込み",
    },
    {
      type: "新規",
      drugName: "ロスバスタチン錠5mg「サワイ」",
      status: "③供給停止",
      volume: "",
      reason: "１．製造上の問題",
      prospect: "エ. －",
    },
    {
      type: "変更",
      drugName: "ランソプラゾールOD錠15mg「サワイ」",
      status: "②限定出荷（自社の事情）",
      volume: "A．概ね通常",
      reason: "３．製造設備の改修等",
      prospect: "ア. 概ね6カ月以内に解除見込み",
    },
    {
      type: "解除",
      drugName: "メトホルミン錠250mgMT「トーワ」",
      status: "",
      volume: "",
      reason: "",
      prospect: "",
    },
    {
      type: "解除",
      drugName: "カンデサルタン錠8mg「サワイ」",
      status: "",
      volume: "",
      reason: "",
      prospect: "",
    },
  ]);
  console.log("   → 送信成功");

  console.log("");
  console.log("テスト完了！ LINEグループを確認してください。");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
