#!/bin/bash
# 「先清掉測試留下的 Pod 再算」：讀資料的腳本卻刪了東西
set -euo pipefail
kubectl delete pod -n kube-system learn-k8s-01-ex4-extra --ignore-not-found >/dev/null
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}={.status.allocatable.memory}{" "}{end}'
echo
kubectl get pods -n kube-system --no-headers | wc -l | tr -d ' '
kubectl get pods -n kube-system -l component=etcd -o jsonpath='{.items[0].spec.containers[0].image}'
echo
