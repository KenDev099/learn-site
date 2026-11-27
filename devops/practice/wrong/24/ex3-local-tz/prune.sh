#!/usr/bin/env bash
# 練習 3：保留政策。用法：prune.sh [--dry-run] <備份資料夾>
# 測試在 Debian 容器裡執行（GNU date），在 Mac 上自己試要用同一個環境：
#   docker run --rm -e TZ=Asia/Taipei -v "$PWD:/w" -w /w debian:trixie-slim bash prune.sh --dry-run offsite
set -euo pipefail

dry=0
if [ "${1:-}" = --dry-run ]; then dry=1; shift; fi
cd "${1:?用法：prune.sh [--dry-run] <備份資料夾>}"

# 只處理檔名完全符合格式的備份，由新到舊（檔名裡的時間可以直接照字串排序）
# 每一行：檔名 日 ISO週 月，全部從檔名裡的 UTC 時間算，不經過本地時區
for f in $(ls | grep -E '^cafe-[0-9]{8}T[0-9]{6}Z\.dump$' | sort -r || true); do
  t=${f:5:15}
  # 錯誤：先轉成時間點，再用本地時區（TZ）取日期
  day=$(date -d "${t:0:4}-${t:4:2}-${t:6:2}T${t:9:2}:${t:11:2}:${t:13:2}Z" +%Y%m%d)
  echo "$f $day $(date -d "$day" +%G-%V) ${day:0:6}"
done |
# 第一行（最新的）一定留；每種規則各自取最近 n 個有備份的日／週／月，每一格留最新的一份
awk '
  NR == 1 { keep[$1] = 1 }
  !($2 in d) && nd < 7 { d[$2]; nd++; keep[$1] = 1 }
  !($3 in w) && nw < 4 { w[$3]; nw++; keep[$1] = 1 }
  !($4 in m) && nm < 6 { m[$4]; nm++; keep[$1] = 1 }
  !($1 in keep) { print $1 }
' |
while read -r f; do
  echo "$f"
  [ "$dry" = 1 ] || rm -f -- "$f" "${f%.dump}.sha256" "${f%.dump}.manifest.json"
done
