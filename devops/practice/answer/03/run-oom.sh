#!/bin/sh
# 用法：sh run-oom.sh（在這個資料夾裡執行）
# 用 node:24.22.2-alpine3.24 啟動名為 ld-03-oom 的容器，執行這個資料夾裡的 eat-memory.mjs，
# 記憶體上限 512 MB、不准用 swap。容器結束後不要刪掉，之後還要 docker inspect 它。
# 提示：把目前的資料夾掛進容器：-v "$(pwd)":/w:ro，容器裡的檔案就在 /w/eat-memory.mjs
docker rm -f ld-03-oom 2>/dev/null

docker run --name ld-03-oom --memory 512m --memory-swap 512m \
  -v "$(pwd)":/w:ro node:24.22.2-alpine3.24 node /w/eat-memory.mjs
