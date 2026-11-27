#!/usr/bin/env bash
# 錯：find | xargs 沒有 -print0／-0，路徑的空白會把參數切開
set -euo pipefail
dir="$1"
find "$dir" -type d | xargs chmod 755
find "$dir" -type f | xargs chmod 644
find "$dir" -type f -name '*.sh' | xargs chmod 755
find "$dir" -type f \( -name '*.env' -o -name '*.pem' \) | xargs chmod 600
find "$dir" -type f -name '*.env' | xargs chown cafe
