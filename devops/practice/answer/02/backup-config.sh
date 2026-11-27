#!/usr/bin/env bash
# 用法：bash backup-config.sh <來源資料夾> <輸出檔>
# 例如：bash backup-config.sh /etc/cafe /backup/cafe-config.tar.gz
set -euo pipefail
src="$1"
out="$2"

# 暫存檔放在輸出檔旁邊（同一個檔案系統，mv 才是原子的）；不管怎麼結束都刪掉它
tmp="$(mktemp "$out.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

tar -cf - -C "$src" . | gzip > "$tmp"
mv "$tmp" "$out"
echo "備份完成：$out"
