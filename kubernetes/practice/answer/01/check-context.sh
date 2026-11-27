#!/bin/bash
# 練習 2：確認 kubectl 指向課程叢集再動手
set -euo pipefail

ctx=$(kubectl config current-context)
if [ "$ctx" != "kind-learn-k8s" ]; then
  echo "目前的 context 是 $ctx，不是 kind-learn-k8s。先在 learn 資料夾執行 export KUBECONFIG=\"\$PWD/kubernetes/practice/.kube/config\"" >&2
  exit 1
fi
kubectl get nodes --no-headers | wc -l | tr -d ' '
