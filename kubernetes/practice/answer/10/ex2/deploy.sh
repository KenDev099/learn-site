#!/usr/bin/env bash
# 練習 2：用法：bash deploy.sh <版本>，例如 bash deploy.sh v2
# 先跑這一版的 migration，成功了才更新 cafe-api；migration 失敗就停下來，不能動到線上的應用。
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-10-ex2
VERSION=${1:?用法：bash deploy.sh <版本>}
JOB="migrate-$VERSION"

# 1. 建立這一版的 migration Job（同一版重跑時 Job 已經存在，apply 顯示 unchanged，下面會直接看到 Complete）
sed "s/__VERSION__/$VERSION/g" migrate-job.yaml | kubectl apply -n "$NS" -f -

# 2. 等它結束：Complete 繼續，Failed 立刻停
state=""
for _ in $(seq 1 60); do
  state=$(kubectl get job "$JOB" -n "$NS" -o jsonpath='{.status.conditions[?(@.status=="True")].type}')
  case " $state " in
    *" Complete "*) break ;;
    *" Failed "*)
      echo "migration $JOB 失敗，停止部署，應用維持原本的版本：" >&2
      kubectl logs "job/$JOB" -n "$NS" --tail=20 >&2 || true
      exit 1 ;;
  esac
  sleep 2
done
if [[ " $state " != *" Complete "* ]]; then
  echo "等 $JOB 超過 120 秒，停止部署" >&2
  exit 1
fi

# 3. migration 成功才更新應用
kubectl set image deployment/cafe-api api="learn-k8s/cafe-api:$VERSION" -n "$NS"
kubectl rollout status deployment/cafe-api -n "$NS" --timeout=120s
