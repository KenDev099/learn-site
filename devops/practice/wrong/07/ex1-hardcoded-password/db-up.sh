#!/bin/sh
# 練習 1：sh db-up.sh（在這個資料夾裡執行；先 export PGPASS=你想要的密碼）
# 用 postgres:18.6-alpine3.24 在背景啟動容器 ld-07-db：
#   - 超級使用者的密碼從環境變數 PGPASS 帶入（不能寫死在這個檔案裡）
#   - 資料放在具名 volume ld-07-pgdata（postgres 18 起要掛在哪個路徑？看課程頁）
#   - 容器裡的 5432 只發布在 127.0.0.1:18070
# 測試會先刪掉舊的 ld-07-db 再執行這個檔案；刪掉容器後再執行一次，資料要還在
set -e

docker run -d --name ld-07-db \
  -e POSTGRES_PASSWORD=cafe-secret \
  -v ld-07-pgdata:/var/lib/postgresql \
  -p 127.0.0.1:18070:5432 \
  postgres:18.6-alpine3.24
