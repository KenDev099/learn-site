#!/usr/bin/env bash
# 練習 2：用法 bash inspect.sh <namespace>
# 找出 <namespace> 裡 app=cafe-hash 的 Pod，讀出 api 容器「實際執行中」的兩個環境變數，印成這樣兩行：
#   UV_THREADPOOL_SIZE=<值>
#   NODE_OPTIONS=<值>
# 映像是 distroless：沒有 sh，kubectl exec 進不去；值寫在映像的 ENV 裡，manifest 看不到。
# TODO：用 kubectl debug 加一個 busybox:1.38.0 的臨時容器（--target 指向 api），從 /proc/1/environ 讀出來
set -euo pipefail
ns="$1"

