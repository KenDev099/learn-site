#!/usr/bin/env bash
# 在 learn 資料夾執行：bash kubernetes/practice/work/04/ex4/curl.sh
set -euo pipefail

url=$(node kubernetes/practice/bin/url.mjs k8s-04-ex4 cafe-api)
# Envoy 容器剛建好時可能還沒接上 Pod，重試幾次
curl -sS --retry 10 --retry-all-errors --retry-delay 3 "$url/version"
