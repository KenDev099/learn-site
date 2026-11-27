#!/usr/bin/env bash
# 練習 1：可靠的備份腳本。執行：bash backup.sh（先 docker compose -p ld-24 up -d --wait）
# 環境變數：DB_CONTAINER（預設 ld-24-db）、DB_NAME（預設 cafe）、OFFSITE_DIR（預設 offsite，模擬異地的備份位置）
set -euo pipefail

DB_CONTAINER=${DB_CONTAINER:-ld-24-db}
DB_NAME=${DB_NAME:-cafe}
OFFSITE_DIR=${OFFSITE_DIR:-offsite}
here=$(cd "$(dirname "$0")" && pwd)

name=cafe-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OFFSITE_DIR"
# 暫存檔跟正式檔放在同一個資料夾：mv 在同一個檔案系統裡才是原子的
tmp_dump="$OFFSITE_DIR/.$name.dump.tmp"
tmp_sha="$OFFSITE_DIR/.$name.sha256.tmp"
tmp_manifest="$OFFSITE_DIR/.$name.manifest.json.tmp"
tmp_latest="$OFFSITE_DIR/.LATEST.tmp"
# 不管成功或失敗，結束時都清掉暫存檔（成功時它們已經改名，rm -f 不會做任何事）
trap 'rm -f "$tmp_dump" "$tmp_sha" "$tmp_manifest" "$tmp_latest"' EXIT

# 1. 在容器裡跑 pg_dump：版本自然跟伺服器一致。一邊寫檔、一邊算大小
bytes=$(docker exec "$DB_CONTAINER" pg_dump -U postgres -d "$DB_NAME" -Fc | tee "$tmp_dump" | wc -c)

# 錯誤：還沒驗證就先更新 LATEST
printf '%s\n' "$name.dump" > "$tmp_latest"
mv "$tmp_latest" "$OFFSITE_DIR/LATEST"

# 2. 快速驗證：pg_restore 讀得出目錄，而且有 orders 的資料
toc=$(docker exec -i "$DB_CONTAINER" pg_restore --list < "$tmp_dump")
grep -q 'TABLE DATA public orders ' <<< "$toc"

# 3. manifest：各表的列數，還原演練用它比對
tables=$(docker exec -i "$DB_CONTAINER" psql -XAtq -v ON_ERROR_STOP=1 -U postgres -d "$DB_NAME" < "$here/counts.sql")
printf '{"dump":"%s","tables":%s}\n' "$name.dump" "$tables" > "$tmp_manifest"

# 4. 校驗和：寫最終的檔名，之後在同一個資料夾跑 sha256sum -c 就能驗證
sum=$(sha256sum < "$tmp_dump" | cut -d ' ' -f 1)
printf '%s  %s\n' "$sum" "$name.dump" > "$tmp_sha"

# 5. 全部成功才改成正式的檔名，最後才更新 LATEST
mv "$tmp_sha" "$OFFSITE_DIR/$name.sha256"
mv "$tmp_manifest" "$OFFSITE_DIR/$name.manifest.json"
mv "$tmp_dump" "$OFFSITE_DIR/$name.dump"

printf '{"file":"%s","bytes":%d,"seconds":%d}\n' "$name.dump" "$((bytes))" "$SECONDS"
