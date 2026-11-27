#!/usr/bin/env bash
# 用法：bash deploy.sh <tag>，例如 bash deploy.sh v2
# 用 Helm 把 ./chart 部署成 namespace k8s-13-ex4 裡名為 cafe 的 release。
# 成功以 0 結束；失敗時 Helm 自動回到上一個成功的 revision，腳本以非 0 結束（CI 看到紅燈）
set -euo pipefail
NS=k8s-13-ex4
TAG="${1:?用法：deploy.sh <tag>}"

if ! helm upgrade --install cafe ./chart -n "$NS" \
  --set image.tag="$TAG" \
  --wait --timeout 3m \
  --atomic; then
  echo "部署 $TAG 失敗，Helm 已回到上一個成功的版本" >&2
  exit 1
fi
echo "部署 $TAG 完成"
