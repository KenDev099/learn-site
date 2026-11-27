#!/bin/sh
# 用法：sh who-listens.sh <port>
# 印出正在監聽這個 TCP port 的程序，每行「PID 名稱」，例如：
#   8 node
# 沒有人監聽時什麼都不印，以結束碼 1 結束。
# 執行環境是 node:24.22.2-alpine3.24 容器：有 busybox 的 netstat、ps，沒有 ss
set -eu
port="$1"

# 在這裡寫
