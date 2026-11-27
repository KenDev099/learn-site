#!/usr/bin/env bash
# 用法：bash deploy.sh <tag>，例如 bash deploy.sh v2
# 部署成功以 0 結束；失敗時自動回滾到上一版、等回滾完成，再以 1 結束（CI 看到紅燈）
set -euo pipefail
NS=k8s-09-ex2
TAG="${1:?用法：deploy.sh <tag>}"

# 換映像並寫下原因（第 3 課）：這兩行不用改
kubectl set image -n "$NS" deployment/cafe-api api="learn-k8s/cafe-api:$TAG"
kubectl annotate -n "$NS" deployment/cafe-api kubernetes.io/change-cause="deploy $TAG" --overwrite

if ! kubectl rollout status -n "$NS" deployment/cafe-api --timeout=120s; then
  echo "部署 $TAG 失敗，回滾到上一版" >&2
  kubectl rollout undo -n "$NS" deployment/cafe-api
  kubectl rollout status -n "$NS" deployment/cafe-api --timeout=120s
  exit 1
fi
echo "部署 $TAG 完成"
