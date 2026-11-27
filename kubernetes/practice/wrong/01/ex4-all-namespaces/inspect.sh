#!/bin/bash
# 第 2 行算成整個叢集的 Pod
set -euo pipefail
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}={.status.allocatable.memory}{" "}{end}'
echo
kubectl get pods -A --no-headers | wc -l | tr -d ' '
kubectl get pods -n kube-system -l component=etcd -o jsonpath='{.items[0].spec.containers[0].image}'
echo
