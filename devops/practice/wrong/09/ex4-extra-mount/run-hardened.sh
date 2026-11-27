#!/bin/sh
# 錯誤：不改 TMP_DIR，另外在 app 預設的上傳目錄掛一個可寫的 tmpfs 繞過唯讀
set -eu
docker run -d --name ld-09-hardened --read-only --tmpfs /tmp --mount type=tmpfs,dst=/home/node/uploads --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:18094:3000 learn-devops/cafe-api:09-1
