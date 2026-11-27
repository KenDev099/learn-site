#!/usr/bin/env bash
# 用法：bash release.sh <tag>，例如 bash release.sh v2
set -euo pipefail
NS=k8s-03-ex3
TAG="${1:?用法：release.sh <tag>}"

kubectl -n "$NS" set image deployment/cafe-api api="learn-k8s/cafe-api:$TAG"
kubectl -n "$NS" annotate deployment/cafe-api kubernetes.io/change-cause="release $TAG" --overwrite
kubectl -n "$NS" rollout status deployment/cafe-api
