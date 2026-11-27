#!/usr/bin/env bash
# 備份（第 24 課的 backup.sh，改成這套環境；這個檔不用改）。用法：bash ops/backup.sh
# 在 OFFSITE_DIR（預設 offsite/，模擬異地）產生 cafe-<UTC 時間>.dump、.sha256、.manifest.json，最後更新 LATEST
set -euo pipefail
cd "$(dirname "$0")/.."
OFFSITE_DIR=${OFFSITE_DIR:-offsite}
db=$(docker compose -f compose.prod.yaml ps -q db)
[ -n "$db" ] || { echo 'db 沒有在跑：先 sh up.sh' >&2; exit 1; }

name=cafe-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OFFSITE_DIR"
tmp="$OFFSITE_DIR/.$name.tmp"
trap 'rm -f "$tmp" "$tmp.sha256" "$tmp.manifest"' EXIT

# 1. 在容器裡 pg_dump（版本跟伺服器一致），先寫暫存檔
docker exec "$db" pg_dump -U postgres -d cafe -Fc > "$tmp"
# 2. 驗證：讀得出目錄、有 orders 的資料
docker exec -i "$db" pg_restore --list < "$tmp" | grep -q 'TABLE DATA public orders '
# 3. 還原演練用的比對資料與校驗和（用容器裡的 sha256sum，Mac 上不一定有）
orders=$(docker exec "$db" psql -XAtq -U postgres -d cafe -c 'SELECT count(*) FROM orders')
printf '{"dump":"%s","orders":%s}\n' "$name.dump" "$orders" > "$tmp.manifest"
printf '%s  %s\n' "$(docker exec -i "$db" sha256sum < "$tmp" | cut -d ' ' -f 1)" "$name.dump" > "$tmp.sha256"
# 4. 全部成功才改成正式檔名，最後才更新 LATEST
mv "$tmp.sha256" "$OFFSITE_DIR/$name.sha256"
mv "$tmp.manifest" "$OFFSITE_DIR/$name.manifest.json"
mv "$tmp" "$OFFSITE_DIR/$name.dump"
echo "$name.dump" > "$OFFSITE_DIR/LATEST"
echo "{\"file\":\"$name.dump\",\"orders\":$orders,\"seconds\":$SECONDS}"
