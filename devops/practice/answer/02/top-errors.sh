#!/usr/bin/env bash
# 用法：bash top-errors.sh <access log 檔案>
# 印出 5xx 次數最多的前 3 個路徑，每行「次數 路徑」，次數相同時依路徑字母排序
set -euo pipefail
log="$1"

# $9 是狀態碼、$7 是路徑；sort -k1,1nr 依次數由大到小，-k2,2 同次數時依路徑排序
awk '$9 ~ /^5[0-9][0-9]$/ { print $7 }' "$log" | sort | uniq -c | sort -k1,1nr -k2,2 | head -n 3 | awk '{ print $1, $2 }'
