#!/usr/bin/env bash
# 還原演練（第 24 課的 restore-drill.sh，改成這套環境；這個檔不用改）
# 用法：bash ops/restore-drill.sh [offsite/cafe-<時間>.dump]（不給就用 LATEST）
# 還原到一個全新的臨時容器 ld-26-drill，比對訂單數，印出花了幾秒（RTO 的參考）；正式的 db 完全不碰
set -euo pipefail
cd "$(dirname "$0")/.."
OFFSITE_DIR=${OFFSITE_DIR:-offsite}
dump=${1:-$OFFSITE_DIR/$(cat "$OFFSITE_DIR/LATEST")}
base=${dump%.dump}
DRILL=ld-26-drill
trap 'docker rm -f -v "$DRILL" > /dev/null 2>&1 || true' EXIT

docker rm -f -v "$DRILL" > /dev/null 2>&1 || true
docker run -d --name "$DRILL" -e POSTGRES_PASSWORD=drill-only postgres:18.6-alpine3.24 > /dev/null
for _ in $(seq 60); do
  docker exec "$DRILL" pg_isready -h 127.0.0.1 -U postgres > /dev/null 2>&1 && break
  sleep 1
done
# 1. 校驗和：檔案壞了就不用往下做
want=$(cut -d ' ' -f 1 "$base.sha256")
got=$(docker exec -i "$DRILL" sha256sum < "$dump" | cut -d ' ' -f 1)
[ "$want" = "$got" ] || { echo "校驗和不符：$dump 壞了或被換掉" >&2; exit 1; }
# 2. 還原：遇到第一個錯誤就停（帳號 cafe_migrator、cafe_app 在臨時容器裡不存在，所以不還原擁有者與權限）
docker exec "$DRILL" createdb -U postgres cafe
docker exec -i "$DRILL" pg_restore -U postgres --exit-on-error --no-owner --no-privileges -d cafe < "$dump"
# 3. 比對：訂單數要跟備份當時一樣
orders=$(docker exec "$DRILL" psql -XAtq -U postgres -d cafe -c 'SELECT count(*) FROM orders')
want=$(sed -E 's/.*"orders":([0-9]+).*/\1/' "$base.manifest.json")
[ "$orders" = "$want" ] || { echo "訂單數不符：備份時 $want，還原出 $orders" >&2; exit 1; }
echo "{\"ok\":true,\"orders\":$orders,\"rto_seconds\":$SECONDS}"
