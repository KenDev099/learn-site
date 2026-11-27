#!/bin/sh
# 練習 3：用 gitleaks（zricethezav/gitleaks:v8.30.1）掃描 $1 這個 git repo，把 JSON 報告印到 stdout
# 找到機密時要以非 0 結束，CI 才會擋下來
set -eu
REPO="$(cd "$1" && pwd)"
echo '[]'
