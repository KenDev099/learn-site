#!/usr/bin/env bash
# 用法：bash release.sh <tag>，例如 bash release.sh v2
set -euo pipefail
NS=k8s-03-ex3
TAG="${1:?用法：release.sh <tag>}"

# TODO 1：把 deployment/cafe-api 裡容器 api 的映像換成 learn-k8s/cafe-api:$TAG
# TODO 2：在 Deployment 寫上 kubernetes.io/change-cause，內容要包含 $TAG
# TODO 3：等 rollout 完成，最多等 180 秒；沒完成時腳本要以非 0 結束
