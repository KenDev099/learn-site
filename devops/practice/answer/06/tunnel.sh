#!/bin/sh
# 練習 3：開一條 localhost:18061 → 伺服器內 127.0.0.1:9000 的 SSH 通道，抓 /stats 存成 stats.json，最後關掉通道
set -eu
cd "$(dirname "$0")"
SOCK=./tunnel.sock
rm -f "$SOCK"

# -f -N：轉送建立好之後才進背景、不執行遠端指令
# ExitOnForwardFailure=yes：轉送建立不起來（例如 18061 被占用）就直接失敗，不會進背景
# -M -S：當主連線並開一個控制 socket，之後用 -O exit 透過它關掉這條連線
ssh -F ssh_config -f -N -M -S "$SOCK" -o ExitOnForwardFailure=yes -L 18061:127.0.0.1:9000 cafe-server
trap 'ssh -F ssh_config -S "$SOCK" -O exit cafe-server 2>/dev/null' EXIT

curl -fsS http://localhost:18061/stats -o stats.json
