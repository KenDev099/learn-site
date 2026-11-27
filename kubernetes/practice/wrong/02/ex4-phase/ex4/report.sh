#!/bin/bash
# 用 phase 判斷：印出的是 Pending，不是容器等待的原因
set -euo pipefail
NS=k8s-02-ex4
SEL=app.kubernetes.io/part-of=cafe
kubectl get pods -n "$NS" -l "$SEL" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | sort
echo ---
kubectl get pods -n "$NS" -l "$SEL" --field-selector=status.phase!=Running \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.phase}{"\n"}{end}' | sort
