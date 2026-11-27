#!/bin/sh
# 錯誤：-a 列出所有狀態的連線，只比對本機位址。從本機 port 9999 連出去的客戶端也會被當成監聽者
set -eu
out=$(netstat -tanp | awk -v port="$1" 'NR > 2 { p = $4; sub(/.*:/, "", p); if (p == port) { split($7, a, "/"); print a[1], a[2] } }' | sort -u)
[ -n "$out" ] || exit 1
echo "$out"
