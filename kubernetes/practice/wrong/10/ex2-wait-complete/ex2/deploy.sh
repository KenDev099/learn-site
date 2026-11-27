#!/usr/bin/env bash
# 錯誤寫法：只等 Complete，migration 失敗時要等到逾時才結束
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-10-ex2
VERSION=$1
JOB="migrate-$VERSION"
sed "s/__VERSION__/$VERSION/g" migrate-job.yaml | kubectl apply -n "$NS" -f -
kubectl wait --for=condition=Complete "job/$JOB" -n "$NS" --timeout=300s
kubectl set image deployment/cafe-api api="learn-k8s/cafe-api:$VERSION" -n "$NS"
kubectl rollout status deployment/cafe-api -n "$NS" --timeout=120s
