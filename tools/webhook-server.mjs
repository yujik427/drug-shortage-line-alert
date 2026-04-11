#!/usr/bin/env node

/**
 * グループID取得用の一時Webhookサーバー
 * グループ内でメッセージを送ると、グループIDを表示する
 */

import { createServer } from "http";

const PORT = 3002;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.events) {
          for (const event of data.events) {
            if (event.source && event.source.groupId) {
              console.log("");
              console.log("==============================");
              console.log("グループIDを取得しました！");
              console.log(event.source.groupId);
              console.log("==============================");
              console.log("");
              console.log("このIDをチャットに貼り付けてください。");
              console.log("Ctrl+C でこのサーバーを停止できます。");
            }
          }
        }
      } catch (e) {
        // ignore
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
});

server.listen(PORT, () => {
  console.log(`Webhookサーバー起動: http://localhost:${PORT}/webhook`);
  console.log("");
  console.log("次の手順で進めてください:");
  console.log("1. 別のターミナルで以下を実行してトンネルを作成:");
  console.log(`   npx localtunnel --port ${PORT}`);
  console.log("2. 表示されたURLをコピー");
  console.log("3. LINE DevelopersでWebhook URLに「URL/webhook」を設定");
  console.log("4. LINEグループで何かメッセージを送る");
  console.log("5. ここにグループIDが表示される");
});
