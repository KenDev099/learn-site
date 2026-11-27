#!/bin/sh
# 練習 3：在背景啟動 nginx:1.30-alpine，容器名稱 ld-01-web，只發布在 127.0.0.1:18010（容器裡的 nginx 聽 80）
# 測試會先刪掉舊的 ld-01-web 再執行這個檔案；在下面寫出 docker run 指令
set -e

docker run -d --name ld-01-web -p 127.0.0.1:18010:80 nginx:1.30-alpine
