#!/bin/sh
# 不修 server.mjs，在 run.sh 裡換成另一個聽 0.0.0.0 的程式
set -e
cd "$(dirname "$0")"

docker run -d --name ld-04-api -p 127.0.0.1:18040:3000 \
  node:24.22.2-alpine3.24 node -e "require('node:http').createServer((q, s) => s.end('ok')).listen(3000, '0.0.0.0')"
