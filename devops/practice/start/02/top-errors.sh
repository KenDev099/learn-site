#!/usr/bin/env bash
# 用法：bash top-errors.sh <access log 檔案>
# 印出 5xx 次數最多的前 3 個路徑，每行「次數 路徑」，次數相同時依路徑字母排序
set -euo pipefail
log="$1"

# 在這裡寫你的管線，讀 "$log"
