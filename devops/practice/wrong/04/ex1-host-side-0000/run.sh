#!/bin/sh
# 練習 1：啟動咖啡店 API 的容器。這個檔案已經寫好，要修的是 server.mjs
# 主機只發布在 127.0.0.1:18040，對到容器裡的 3000
set -e
cd "$(dirname "$0")"

docker run -d --name ld-04-api -p 0.0.0.0:18040:3000 \
  -v "$PWD/server.mjs:/app/server.mjs:ro" \
  node:24.22.2-alpine3.24 node /app/server.mjs
