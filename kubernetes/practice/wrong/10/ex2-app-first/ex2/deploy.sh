#!/usr/bin/env bash
# 錯誤寫法：先更新應用，再跑 migration
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-10-ex2
VERSION=$1
JOB="migrate-$VERSION"
kubectl set image deployment/cafe-api api="learn-k8s/cafe-api:$VERSION" -n "$NS"
kubectl rollout status deployment/cafe-api -n "$NS" --timeout=60s || true
sed "s/__VERSION__/$VERSION/g" migrate-job.yaml | kubectl apply -n "$NS" -f -
kubectl wait --for=condition=Complete "job/$JOB" -n "$NS" --timeout=60s
