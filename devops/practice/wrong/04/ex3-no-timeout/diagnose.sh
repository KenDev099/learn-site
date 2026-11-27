#!/bin/bash
# 練習 3：bash diagnose.sh <host> <port>
# 只印出一個字：open、refused 或 timeout，而且 2 秒內要結束
# 這個腳本在 ubuntu:24.04 容器裡執行：有 bash 和 timeout，沒有 nc、ping
host=$1
port=$2

# 提示：bash 可以用 /dev/tcp/<host>/<port> 開一條 TCP 連線
#   bash -c "exec 3<>/dev/tcp/$host/$port"
# 連上時結束碼是 0；被拒絕時結束碼是 1，錯誤訊息含 Connection refused

out=$(bash -c "exec 3<>/dev/tcp/$host/$port" 2>&1)
rc=$?
if [ "$rc" -eq 0 ]; then
  echo open
elif [ "$rc" -eq 124 ]; then
  echo timeout            # timeout 指令時間到時，結束碼是 124
elif printf '%s' "$out" | grep -q 'Connection refused'; then
  echo refused
else
  echo "error: $out" >&2  # 其他失敗（例如名稱查不到）不要硬塞進三種之一
  exit 2
fi
