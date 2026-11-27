#!/usr/bin/env bash
# 練習 2：還原演練。執行：bash restore-drill.sh offsite/cafe-<時間>.dump
set -euo pipefail

dump=${1:?用法：restore-drill.sh <備份檔.dump>}
base=${dump%.dump}
here=$(cd "$(dirname "$0")" && pwd)
DRILL=ld-24-db

# 不管成功或失敗，結束時都收掉臨時容器

# 1. 校驗和：檔案壞了或被換掉，就不用往下做了
if ! (cd "$(dirname "$dump")" && sha256sum -c --status "$(basename "$base").sha256"); then
  echo "校驗和不符：$dump 壞了或被換掉" >&2
  exit 1
fi

# 3. 還原：遇到第一個錯誤就停，結束碼交給 set -e 檢查
docker exec -i "$DRILL" pg_restore -U postgres --clean --if-exists --exit-on-error -d cafe < "$dump"

# 4. 列數要跟備份當時的 manifest 一樣
got=$(docker exec -i "$DRILL" psql -XAtq -v ON_ERROR_STOP=1 -U postgres -d cafe < "$here/counts.sql")
if ! jq -e --argjson got "$got" '.tables == $got' "$base.manifest.json" > /dev/null; then
  echo "列數跟 manifest 不一樣：還原出來是 $got" >&2
  exit 1
fi

# 5. 煙霧測試：app 最常做的查詢要能跑
docker exec -i "$DRILL" psql -XAtq -v ON_ERROR_STOP=1 -U postgres -d cafe < "$here/smoke.sql" > /dev/null

echo "{\"ok\":true,\"rto_seconds\":$SECONDS}"
