#!/usr/bin/env bash
# 練習 3：保留政策。用法：prune.sh [--dry-run] <備份資料夾>
# 測試在 Debian 容器裡執行（GNU date），在 Mac 上自己試要用同一個環境：
#   docker run --rm -e TZ=Asia/Taipei -v "$PWD:/w" -w /w debian:trixie-slim bash prune.sh --dry-run offsite
# 現在的寫法：只留修改時間最新的 30 個檔案，其他全部刪掉
cd "${@: -1}"
ls -1t | tail -n +31 | xargs rm -f
