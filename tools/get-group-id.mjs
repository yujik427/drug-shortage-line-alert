#!/usr/bin/env node

/**
 * LINEグループIDを取得するための一時サーバー
 * Botがグループに参加したときのイベントからグループIDを取り出す
 *
 * 使い方:
 * 1. このスクリプトを実行
 * 2. LINE DevelopersでWebhook URLを設定（ngrokなどが必要）
 *
 * 簡易的な代替手段: Push APIでBotからグループにメッセージを送るには
 * グループIDが必要。Webhook無しで取得するには、
 * グループ内で何かメッセージを送ってもらう方法もある。
 *
 * ここではもっと簡単な方法を使う:
 * LINE公式の「チャットモード」のログからグループIDを取得するか、
 * テスト送信用にBot APIで直接グループIDを取得する
 */

import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("Error: LINE_CHANNEL_ACCESS_TOKEN が .env に設定されていません");
  process.exit(1);
}

async function main() {
  console.log("LINE Botのテスト送信を行います。");
  console.log("");
  console.log("グループIDの取得方法:");
  console.log("1. グループ内でBotに何かメッセージを送ってください");
  console.log("2. LINE DevelopersのWebhookログで確認できます");
  console.log("");
  console.log("または、グループIDを直接指定してテスト送信できます:");
  console.log("node tools/test-line-push.mjs <グループID>");
}

main();
