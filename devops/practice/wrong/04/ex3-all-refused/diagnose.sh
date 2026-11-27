#!/bin/bash
# 練習 3：bash diagnose.sh <host> <port>
# 只印出一個字：open、refused 或 timeout，而且 2 秒內要結束
# 這個腳本在 ubuntu:24.04 容器裡執行：有 bash 和 timeout，沒有 nc、ping
host=$1
port=$2

# 提示：bash 可以用 /dev/tcp/<host>/<port> 開一條 TCP 連線
#   bash -c "exec 3<>/dev/tcp/$host/$port"
# 連上時結束碼是 0；被拒絕時結束碼是 1，錯誤訊息含 Connection refused

if timeout 2 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then echo open; else echo refused; fi
