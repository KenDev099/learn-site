#!/usr/bin/env bash
# 錯：先檢查來源資料夾存在，然後直接寫正式檔名：tar 中途失敗時舊備份已經被蓋掉
set -euo pipefail
src="$1"
out="$2"
[ -d "$src" ] || { echo "找不到 $src" >&2; exit 1; }
tar -cf - -C "$src" . | gzip > "$out"
