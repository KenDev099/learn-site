# 咖啡店服務 runbook

namespace 是 k8s-16、release 是 cafe。先在 learn/ 執行 `export KUBECONFIG="$PWD/kubernetes/practice/.kube/config"`，再 `cd kubernetes/practice/work/16`。

## 部署

先跑這一版的 migration，成功才更新應用，最後做煙霧測試；任何一步失敗都以非 0 結束，Helm 會自動回到上一版。

```bash
NS=k8s-16 bash deploy.sh v2
helm history cafe -n k8s-16 --max 5
```

## 回滾

回到上一個 revision。資料庫不回滾：migration 都是 expand，舊版照樣能跑。

```bash
NS=k8s-16 bash rollback.sh
kubectl rollout status deployment/cafe-api -n k8s-16 --timeout=3m
```

## 擴展

平常交給 HPA（2～4 個）。要臨時提高下限時改 values 再部署，不要 kubectl scale（下次 helm upgrade 或 HPA 會改回去）。

```bash
kubectl get hpa cafe-api -n k8s-16
kubectl top pod -n k8s-16 -l app.kubernetes.io/component=api
helm upgrade cafe ./chart -n k8s-16 -f chart/values-local.yaml --reuse-values --set autoscaling.minReplicas=3 --wait --timeout 5m
```

## 處理 CrashLoopBackOff

先蒐證再動手：上一次崩潰的 log 與 Last State 的 reason、exit code（137／OOMKilled 是被殺，1 是程式自己結束）。

```bash
kubectl get pods -n k8s-16 -o wide
kubectl describe pod -l app.kubernetes.io/component=worker
kubectl logs -n k8s-16 deployment/cafe-worker --previous --tail=50
kubectl events -n k8s-16 --types=Warning
```

## 輪替資料庫密碼

1. 在資料庫建立新密碼（DBA 或 RDS 主控台），舊密碼先不要停用。
2. 更新 Secret，再重啟用到它的 Deployment：環境變數只在容器啟動時讀一次。
3. 確認新 Pod 都 Ready 之後，再停用舊密碼。

```bash
kubectl create secret generic cafe-secrets -n k8s-16 \
  --from-literal=DATABASE_URL="$NEW_DATABASE_URL" \
  --from-literal=DATABASE_URL_MIGRATOR="$NEW_DATABASE_URL_MIGRATOR" \
  --from-literal=REDIS_URL="$REDIS_URL" \
  --dry-run=client -o yaml | kubectl apply -n k8s-16 -f -
kubectl rollout restart deployment/cafe-api -n k8s-16
kubectl rollout restart deployment/cafe-worker -n k8s-16
kubectl rollout status deployment/cafe-api -n k8s-16 --timeout=3m
kubectl rollout status deployment/cafe-worker -n k8s-16 --timeout=3m
```
