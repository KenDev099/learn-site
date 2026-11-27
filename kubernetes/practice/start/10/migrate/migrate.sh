#!/bin/sh
# 依檔名順序執行 /migrations/*.sql，已經記在 schema_migrations 的跳過：同一版跑幾次結果都一樣（冪等）。
# 每個檔案和它的紀錄在同一個交易裡：失敗就整個回滾，下次重跑從同一個檔案開始。
set -eu
: "${DATABASE_URL:?缺少環境變數 DATABASE_URL}"
# 拿不到鎖就放棄，不要排在正式資料庫的流量後面卡住所有人（PostgreSQL 課第 34 課）
export PGOPTIONS="-c lock_timeout=5s -c statement_timeout=60s"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
for f in /migrations/*.sql; do
  name=$(basename "$f")
  if [ "$(psql "$DATABASE_URL" -tA -c "SELECT 1 FROM schema_migrations WHERE name = '$name'")" = 1 ]; then
    echo "已執行過，跳過：$name"
    continue
  fi
  echo "執行：$name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f" \
    -c "INSERT INTO schema_migrations (name) VALUES ('$name')"
done
echo "migration 完成"
