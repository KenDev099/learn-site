#!/bin/bash
# 先查再檢查：在錯的叢集上已經下過指令了
count=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
ctx=$(kubectl config current-context)
if [ "$ctx" != "kind-learn-k8s" ]; then
  echo "context 不對：$ctx" >&2
  exit 1
fi
echo "$count"
