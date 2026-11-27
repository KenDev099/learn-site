#!/bin/sh
# 包裝腳本：先印出設定，再啟動 server.mjs
set -eu
cd /app
echo "cafe-api starting: PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-development}"

# exec：node 取代這個 sh，沿用同一個 PID（容器裡就是 PID 1），docker stop 的 SIGTERM 直接送到 node
exec node server.mjs
