#!/usr/bin/env bash
# 用法：bash deploy.sh <tag>，例如 bash deploy.sh v2
# 部署成功以 0 結束；失敗時自動回滾到上一版、等回滾完成，再以 1 結束（CI 看到紅燈）
set -euo pipefail
NS=k8s-09-ex2
TAG="${1:?用法：deploy.sh <tag>}"

# 換映像並寫下原因（第 3 課）：這兩行不用改
kubectl set image -n "$NS" deployment/cafe-api api="learn-k8s/cafe-api:$TAG"
kubectl annotate -n "$NS" deployment/cafe-api kubernetes.io/change-cause="deploy $TAG" --overwrite

# TODO 1：等 rollout 完成，最多 120 秒（注意 set -e：指令失敗時腳本會直接結束，要自己接住失敗）
# TODO 2：沒完成時：印出訊息、rollout undo、再等回滾完成（最多 120 秒），最後 exit 1
