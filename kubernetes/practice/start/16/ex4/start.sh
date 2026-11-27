#!/usr/bin/env bash
# 練習 4（課程提供，不用改）：把團隊的 chart（ex4/chart，含同事 v3 的變更）部署到 k8s-16-incident，重現三個事故。
# 用法：在 learn/ 執行 bash kubernetes/practice/work/16/ex4/start.sh
# 修好 chart 之後再執行一次：會從零重建 namespace 再部署，確認從零部署也不會再出事
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-16-incident
bash ../dev-up.sh "$NS"
# 不加 --wait：讓壞掉的狀態留在叢集上給你查
helm upgrade --install cafe ./chart -n "$NS" -f chart/values-local.yaml --set image.tag=v1
# 模擬付款完成：放 5 張收據進佇列
kubectl exec -n "$NS-data" deploy/redis -- sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli LPUSH receipts:pending order-1 order-2 order-3 order-4 order-5'
echo "部署送出了。用第 14 課的流程查：kubectl get pods -n $NS 開始"
