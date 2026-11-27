#!/usr/bin/env bash
# 練習 2：用法：bash apply.sh
# 叢集上已經有 cafe-config（LOG_LEVEL=info）和 2 個 cafe-api 的 Pod，而且一直有流量。
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-06-ex2

kubectl -n "$NS" apply -f configmap.yaml
kubectl -n "$NS" apply -f deployment.yaml
sleep 60
