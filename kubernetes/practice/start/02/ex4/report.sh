#!/bin/bash
# 練習 4：用 kubectl 讀 k8s-02-ex4 這個 namespace，印出（要求寫在課程頁）：
#   1. app.kubernetes.io/part-of=cafe 的 Pod 名稱，每行一個、排序
#   2. 一行 ---
#   3. 其中容器正在等待（Waiting）的 Pod：「名稱 原因」，每行一個、排序
set -euo pipefail
NS=k8s-02-ex4

# TODO
