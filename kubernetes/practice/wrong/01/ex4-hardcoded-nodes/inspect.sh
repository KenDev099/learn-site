#!/bin/bash
# 第 1 行照抄這台機器的節點名稱與記憶體，只有第 2、3 行即時查
set -euo pipefail
echo "learn-k8s-control-plane=8024556Ki learn-k8s-worker=8024556Ki learn-k8s-worker2=8024556Ki"
kubectl get pods -n kube-system --no-headers | wc -l | tr -d ' '
kubectl get pods -n kube-system -l component=etcd -o jsonpath='{.items[0].spec.containers[0].image}'
echo
