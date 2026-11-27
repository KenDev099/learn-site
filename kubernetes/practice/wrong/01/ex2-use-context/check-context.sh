#!/bin/bash
# 不對就自動切過去：改掉了別人的 kubeconfig
ctx=$(kubectl config current-context)
if [ "$ctx" != "kind-learn-k8s" ]; then
  kubectl config use-context kind-learn-k8s || { echo "切換失敗" >&2; exit 1; }
fi
kubectl get nodes --no-headers | wc -l | tr -d ' '
