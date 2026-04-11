#!/bin/bash

cd "$(dirname "$0")"

echo ""
echo "========================================="
echo "  出荷調整品 LINEアラート を起動します"
echo "========================================="
echo ""

if ! command -v node &> /dev/null; then
  echo "エラー: Node.js がインストールされていません"
  echo "https://nodejs.org/ からインストールしてください"
  echo ""
  echo "何かキーを押すと閉じます..."
  read -n 1
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "初回セットアップ中（少し時間がかかります）..."
  npm install
  echo ""
fi

echo "起動中..."
echo ""

sleep 1
open "http://localhost:3010"

node scheduler.mjs
