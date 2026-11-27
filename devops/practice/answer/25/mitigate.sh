#!/bin/sh
# 練習 2：止血
# 判斷：5xx 只出現在 POST /orders，stack 指向 newCheckout；CHANGELOG 說它是 2.4.0 新增、由旗標 new_checkout 控制、預設開啟 → 旗標問題
# 不回滾：2.4.0 含安全修正（拒絕負數 quantity），退回 2.3.1 會把漏洞放回來。只關旗標，再送 SIGHUP 讓 api 重新讀設定
set -eu
cd "$(dirname "$0")"

node -e '
const fs = require("node:fs")
const file = "state/flags.json"
const flags = JSON.parse(fs.readFileSync(file, "utf8"))
flags.new_checkout = false
fs.writeFileSync(file, JSON.stringify(flags, null, 2) + "\n")
'
docker kill --signal HUP ld-25-api
