#!/usr/bin/env bash
# 練習 2：用法：bash apply.sh
# 叢集上已經有 cafe-config（LOG_LEVEL=info）和 2 個 cafe-api 的 Pod，而且一直有流量。
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-06-ex2

# TODO 1：用 kubectl apply 把 configmap.yaml（你已經改成 debug）套用到 $NS
# TODO 2：讓 deployment/cafe-api 的 Pod 換成讀到新設定的新 Pod，過程不能停機（不要刪 Pod）
# TODO 3：等更新完成，最多等 180 秒；沒完成時腳本要以非 0 結束
