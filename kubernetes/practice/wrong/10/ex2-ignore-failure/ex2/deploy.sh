#!/usr/bin/env bash
# 錯誤寫法：migration 結束就部署，不管成功還是失敗
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-10-ex2
VERSION=$1
JOB="migrate-$VERSION"
sed "s/__VERSION__/$VERSION/g" migrate-job.yaml | kubectl apply -n "$NS" -f -
for _ in $(seq 1 60); do
  state=$(kubectl get job "$JOB" -n "$NS" -o jsonpath='{.status.conditions[?(@.status=="True")].type}')
  case " $state " in *" Complete "*|*" Failed "*) break ;; esac
  sleep 2
done
kubectl set image deployment/cafe-api api="learn-k8s/cafe-api:$VERSION" -n "$NS"
kubectl rollout status deployment/cafe-api -n "$NS" --timeout=30s || true
