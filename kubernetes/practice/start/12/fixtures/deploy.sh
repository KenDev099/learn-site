#!/usr/bin/env bash
# 第 9 課練習 2 的部署腳本（namespace 換成 k8s-12-ex1，這個檔案不用改）
# 練習 1 的測試會用 ci-deployer 的 token 執行它：bash deploy.sh v2
set -euo pipefail
NS=k8s-12-ex1
TAG="${1:?用法：deploy.sh <tag>}"

kubectl set image -n "$NS" deployment/cafe-api api="learn-k8s/cafe-api:$TAG"
kubectl annotate -n "$NS" deployment/cafe-api kubernetes.io/change-cause="deploy $TAG" --overwrite

if ! kubectl rollout status -n "$NS" deployment/cafe-api --timeout=120s; then
  echo "部署 $TAG 失敗，回滾到上一版" >&2
  kubectl rollout undo -n "$NS" deployment/cafe-api
  kubectl rollout status -n "$NS" deployment/cafe-api --timeout=120s
  exit 1
fi
echo "部署 $TAG 完成"
