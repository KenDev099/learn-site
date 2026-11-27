#!/usr/bin/env bash
# 練習 2：用法 bash inspect.sh <namespace>
# 找出 <namespace> 裡 app=cafe-hash 的 Pod，讀出 api 容器「實際執行中」的兩個環境變數
set -euo pipefail
ns="$1"
pod=$(kubectl get pod -n "$ns" -l app=cafe-hash -o jsonpath='{.items[0].metadata.name}')
# 臨時容器和 api 共用程序空間（--target），api 的 node 在這個空間裡是 PID 1。
# 讀別的使用者（distroless 的 nonroot＝65532）的 /proc/1/environ 要 SYS_PTRACE：--profile=legacy 會加上（kubectl 1.36 的預設，寫出來比較清楚）
# --attach 不開 stdin：指令跑完就結束；容器結束得太快、attach 不上時 kubectl 會改讀它的 log，一樣拿得到輸出
kubectl debug -n "$ns" "pod/$pod" --image=busybox:1.38.0 --target=api --profile=legacy --attach --quiet \
  -- sh -c "tr '\0' '\n' < /proc/1/environ" </dev/null 2>/dev/null \
  | grep -E '^(UV_THREADPOOL_SIZE|NODE_OPTIONS)='
