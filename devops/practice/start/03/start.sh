#!/bin/sh
# 包裝腳本：先印出設定，再啟動 server.mjs
# 問題：docker stop 要等 10 秒、結束碼 137，log 裡沒有 shutdown complete
set -eu
cd /app
echo "cafe-api starting: PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-development}"

node server.mjs
