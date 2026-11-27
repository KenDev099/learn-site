# Service cafe-api 沒有流量：診斷紀錄

## 我用了哪兩個指令

1. `kubectl get endpointslice -n k8s-04-ex2 -l kubernetes.io/service-name=cafe-api`
2. `kubectl describe service cafe-api -n k8s-04-ex2` 和 `kubectl get pods -n k8s-04-ex2 --show-labels`

## 看到什麼、原因是什麼

- 一開始 EndpointSlice 的 ENDPOINTS 是 `<unset>`：selector 沒挑到任何 Pod。describe 看到 Selector 是 `app.kubernetes.io/instance=mian`，Pod 的 label 是 `main`，拼錯了。
- 修好 selector 之後 ENDPOINTS 有 3 個 IP，但 PORTS 是 `<unset>`：targetPort 寫 `web`，容器的 port 名字是 `http`，對不上。改成 `targetPort: http`。
