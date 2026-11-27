#!/bin/sh
# 練習 3：伺服器上的 admin 服務只聽 127.0.0.1:9000，外面連不到
#   1. 開一條背景 SSH 通道：本機 18061 → 伺服器的 127.0.0.1:9000，確定建立成功才往下走
#   2. 抓 http://localhost:18061/stats 存成 stats.json
#   3. 不管成功失敗，結束前都關掉通道，不留下 ssh 程序
# 通道建不起來（例如 18061 已被占用）時要以非 0 結束
set -eu
cd "$(dirname "$0")"

echo 'TODO：完成 tunnel.sh' >&2
exit 1
