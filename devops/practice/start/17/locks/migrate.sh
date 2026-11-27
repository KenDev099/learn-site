#!/bin/sh
# 練習 3：套用 migrations/ 裡還沒套用的 migration。執行：DATABASE_URL=postgres://… sh migrate.sh
# 現在的寫法：等不到鎖就一直等（後面的查詢全部跟著排隊），失敗了也不重試
npx node-pg-migrate up -m migrations
