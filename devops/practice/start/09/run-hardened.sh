#!/bin/sh
# 練習 4：在背景執行 learn-devops/cafe-api:09-1，容器名稱 ld-09-hardened，只發布在 127.0.0.1:18094
# 現在是沒有任何加固的寫法
set -eu
docker run -d --name ld-09-hardened -p 127.0.0.1:18094:3000 learn-devops/cafe-api:09-1
