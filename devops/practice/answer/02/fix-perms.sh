#!/usr/bin/env bash
# 用法：bash fix-perms.sh <資料夾>
# 資料夾 755、*.sh 755、*.env 與 *.pem 600、其他檔案 644；*.env 的擁有者改成 cafe
set -euo pipefail
dir="$1"

# find 給的是完整路徑（"$dir"/-deploy.pem），不會被當成選項；-exec … {} + 不經過 shell，空白不會被切開
find "$dir" -type d -exec chmod 755 {} +
find "$dir" -type f -exec chmod 644 {} +
find "$dir" -type f -name '*.sh' -exec chmod 755 {} +
find "$dir" -type f \( -name '*.env' -o -name '*.pem' \) -exec chmod 600 {} +
find "$dir" -type f -name '*.env' -exec chown cafe {} +
