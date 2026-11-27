#!/usr/bin/env bash
# 用法：bash fix-perms.sh <資料夾>
# 資料夾 755、*.sh 755、*.env 與 *.pem 600、其他檔案 644；*.env 的擁有者改成 cafe
set -euo pipefail
dir="$1"

# 在這裡寫你的指令
