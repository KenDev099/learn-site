#!/usr/bin/env bash
# 第 14 課：在課程叢集部署六組壞掉的服務，讓你練習除錯。在 learn 資料夾執行：
#   export KUBECONFIG="$PWD/kubernetes/practice/.kube/config"
#   bash kubernetes/practice/work/14/break.sh
# 練習 1 的五組放在 k8s-14-a～k8s-14-e，練習 2 的 cafe-hash 放在 k8s-14-f。
# 一律部署起始的（壞掉的）manifest：practice/start/14/，不是你正在改的 work/14/。
# 用完：kubectl delete namespace k8s-14-a k8s-14-b k8s-14-c k8s-14-d k8s-14-e k8s-14-f
set -euo pipefail
cd "$(dirname "$0")"
START=../../start/14
APP=../../shared/cafe-api
k() { kubectl --context kind-learn-k8s "$@"; }

for g in a b c d e f; do
  ns="k8s-14-$g"
  k delete namespace "$ns" --ignore-not-found --wait=true >/dev/null
  k create namespace "$ns" >/dev/null
  k label namespace "$ns" learn.course=kubernetes learn.task=14 >/dev/null
done
k create secret generic cafe-db -n k8s-14-b --from-literal=db-password="$(head -c 16 /dev/urandom | base64)" >/dev/null
for g in a b c d e; do k apply -n "k8s-14-$g" -f "$START/ex1/$g/"; done

# 練習 2：建置 cafe-hash（設定藏在映像的 ENV，數值每次隨機）並載入叢集，第一次要 1～2 分鐘
case "$(uname -m)" in arm64|aarch64) platform=linux/arm64 ;; *) platform=linux/amd64 ;; esac
heap=$(( (RANDOM % 6 + 6) * 16 ))
docker build -q --platform "$platform" -f ex2/image/Dockerfile --build-arg POOL=1 --build-arg HEAP="$heap" -t learn-k8s/cafe-hash:v1 "$APP" >/dev/null
kind load docker-image learn-k8s/cafe-hash:v1 --name learn-k8s
k apply -n k8s-14-f -f "$START/ex2/deployment.yaml"

echo
echo "六組都部署好了。從第一步開始：kubectl get pods -n k8s-14-a -o wide（b～f 一樣）"
