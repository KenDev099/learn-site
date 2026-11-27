#!/usr/bin/env bash
# 用法：bash rollback.sh：回到上一個 revision，並等它完成
set -euo pipefail
NS=k8s-03-ex3

kubectl -n "$NS" set image deployment/cafe-api api=learn-k8s/cafe-api:v1
kubectl -n "$NS" rollout status deployment/cafe-api --timeout=180s
