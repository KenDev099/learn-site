#!/bin/sh
# 練習 1：把練習伺服器的主機金鑰寫進 ./known_hosts，但只在指紋對得上時才寫
set -eu
cd "$(dirname "$0")"

# 從網路拿到的主機金鑰（可能是冒牌貨），先寫到暫存檔
ssh-keyscan -p 18060 -t ed25519 127.0.0.1 > known_hosts 2>/dev/null || true
got=$(ssh-keygen -lf known_hosts 2>/dev/null | awk '{print $2}') || true
# 從另一個管道拿到的正確指紋
want=$(docker exec ld-06-server ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}') || true

if [ -z "$got" ] || [ "$got" != "$want" ]; then
  echo "主機金鑰指紋對不上：網路上拿到 ${got:-（沒有）}，伺服器上是 ${want:-（查不到）}。不寫入 known_hosts" >&2
  exit 1
fi
echo "已信任 [127.0.0.1]:18060，指紋 $got"
