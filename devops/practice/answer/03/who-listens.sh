#!/bin/sh
# 用法：sh who-listens.sh <port>
# 印出正在監聽這個 TCP port 的程序，每行「PID 名稱」，例如：
#   8 node
# 沒有人監聽時什麼都不印，以結束碼 1 結束。
# 執行環境是 node:24.22.2-alpine3.24 容器：有 busybox 的 netstat、ps，沒有 ss
set -eu
port="$1"

# -l 只看 LISTEN、-t 只看 TCP、-n 不轉成名稱、-p 顯示 PID/程式名稱
# 第 4 欄是本機位址（0.0.0.0:8080、:::8080），取最後一個冒號後面的 port 整個比對，18080 才不會被當成 8080
out=$(netstat -ltnp | awk -v port="$port" '
  NR > 2 { p = $4; sub(/.*:/, "", p); if (p == port) { split($7, a, "/"); print a[1], a[2] } }
' | sort -u)

[ -n "$out" ] || exit 1
echo "$out"
