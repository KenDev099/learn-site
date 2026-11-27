#!/bin/bash
# 用名稱前綴挑 Pod，而不是 label selector
set -euo pipefail
NS=k8s-02-ex4
kubectl get pods -n "$NS" --no-headers | awk '{print $1}' | grep '^cafe-' | sort
echo ---
kubectl get pods -n "$NS" --no-headers | grep '^cafe-' | awk '$3 != "Running" {print $1, $3}' | sort
