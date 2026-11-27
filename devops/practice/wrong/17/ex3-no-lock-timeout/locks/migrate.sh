#!/bin/sh
# 套用 migration：每次最多等鎖 3 秒，等不到就放棄、等一下再試，最多 5 次
# PGOPTIONS 是連線時送給 PostgreSQL 的參數，node-pg-migrate 用的 pg 套件會讀它，只影響這次 migration 的連線
# statement_timeout 要比 migration 裡最慢的那一句還長，不然永遠不會成功
export PGOPTIONS='-c statement_timeout=60s'
attempt=1
wait=1
while :; do
  if npx node-pg-migrate up -m migrations; then
    echo "migration 成功（第 $attempt 次）"
    exit 0
  fi
  if [ "$attempt" -ge 5 ]; then
    echo "試了 $attempt 次都失敗，放棄：查 pg_locks 看是誰拿著鎖" >&2
    exit 1
  fi
  echo "第 $attempt 次失敗（多半是等不到鎖），${wait} 秒後重試" >&2
  sleep "$wait"
  attempt=$((attempt + 1))
  wait=$((wait * 2))
done
