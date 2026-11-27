#!/bin/bash
# 練習 4：用 kubectl 讀 k8s-02-ex4 這個 namespace，印出（要求寫在課程頁）：
#   1. app.kubernetes.io/part-of=cafe 的 Pod 名稱，每行一個、排序
#   2. 一行 ---
#   3. 其中容器正在等待（Waiting）的 Pod：「名稱 原因」，每行一個、排序
set -euo pipefail
NS=k8s-02-ex4
SEL=app.kubernetes.io/part-of=cafe

kubectl get pods -n "$NS" -l "$SEL" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | sort
echo ---
# 沒有在等待的容器，reason 是空的，那一行只有名稱一欄：用 awk 留下兩欄的
kubectl get pods -n "$NS" -l "$SEL" \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.containerStatuses[0].state.waiting.reason}{"\n"}{end}' \
  | awk 'NF == 2' | sort
