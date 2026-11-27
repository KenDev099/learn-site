#!/bin/sh
# 練習 3：零停機的藍綠部署（要求看課程頁的練習 3）。用法：sh deploy.sh <映像>，例如 sh deploy.sh "$(sh release.sh 2.0.0)"
# 現在接流量的顏色寫在 nginx/active.conf（server api-blue:3000 或 api-green:3000）
set -eu
cd "$(dirname "$0")"
image=${1:?用法：sh deploy.sh <映像>}

echo "deploy.sh 還沒寫" >&2
exit 1
