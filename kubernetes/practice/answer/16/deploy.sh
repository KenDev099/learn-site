#!/usr/bin/env bash
# 用法：bash deploy.sh <版本>，例如 bash deploy.sh v2。namespace 預設 k8s-16，可以用 NS=... 覆寫
# 順序：1. 這一版的 migration（失敗就停，線上的應用不動）→ 2. helm 更新應用（失敗自動回滾）→ 3. 煙霧測試
set -euo pipefail
cd "$(dirname "$0")"
NS="${NS:-k8s-16}"
VERSION="${1:?用法：bash deploy.sh <版本>}"
JOB="cafe-migrate-$VERSION"

# 1. migration：ConfigMap 放 migration 檔，Job 用 migrator 帳號執行。同一版重跑時先刪掉舊的 Job（已套用的檔案會略過）
kubectl create configmap "$JOB" -n "$NS" --from-file=migrate/sql/ --dry-run=client -o yaml | kubectl apply -n "$NS" -f -
kubectl delete job "$JOB" -n "$NS" --ignore-not-found --wait
sed "s/__VERSION__/$VERSION/g" migrate/job.yaml | kubectl apply -n "$NS" -f -
state=""
for _ in $(seq 1 120); do
  # API server 偶爾逾時不代表失敗：查不到就當成還在跑，下一輪再查
  state=$(kubectl get job "$JOB" -n "$NS" -o jsonpath='{.status.conditions[?(@.status=="True")].type}') || state=""
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
  echo "等 $JOB 超過 4 分鐘，停止部署" >&2
  exit 1
fi

# 2. 更新應用：等 Pod 真的 Ready，失敗自動回到上一個成功的 revision
if ! helm upgrade --install cafe ./chart -n "$NS" -f chart/values-local.yaml \
  --set image.tag="$VERSION" \
  --wait --timeout 5m --rollback-on-failure; then
  echo "部署 $VERSION 失敗，Helm 已回到上一個成功的版本" >&2
  exit 1
fi

# 3. 煙霧測試：從叢集內經過 Service 打兩個關鍵端點，任何一個不是 2xx 就判定失敗
for path in /health/ready /products; do
  kubectl exec -n k8s-tools deploy/probe -- curl -fsS -m 5 -o /dev/null "http://cafe-api.$NS.svc.cluster.local$path"
done
echo "部署 $VERSION 完成"
