#!/bin/sh
# 練習 3：用 gitleaks（zricethezav/gitleaks:v8.30.1）掃描 $1 這個 git repo，把 JSON 報告印到 stdout
# 找到機密時要以非 0 結束，CI 才會擋下來
set -eu
REPO="$(cd "$1" && pwd)"
# git 模式掃每一個 commit 的變更，已經刪掉的檔案也找得到；--redact 讓報告裡不出現機密本身
# gitleaks 找到機密時以 1 結束，set -e 會讓腳本也以 1 結束
docker run --rm -v "$REPO:/repo:ro" zricethezav/gitleaks:v8.30.1 \
  git /repo --report-format json --report-path - --no-banner
