#!/usr/bin/env bash
# 錯：狀態碼「含有」5 就算，405 也被算進去
set -euo pipefail
log="$1"
awk '$9 ~ /5/ { print $7 }' "$log" | sort | uniq -c | sort -k1,1nr -k2,2 | head -n 3
