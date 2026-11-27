#!/bin/bash
# 練習 4：用 kubectl 讀出叢集的資訊，印出三行
set -euo pipefail

kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}={.status.allocatable.memory}{" "}{end}'
echo
kubectl get pods -n kube-system --no-headers | wc -l | tr -d ' '
kubectl get pods -n kube-system -l component=etcd -o jsonpath='{.items[0].spec.containers[0].image}'
echo
