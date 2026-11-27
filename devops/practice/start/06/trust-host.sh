#!/bin/sh
# 練習 1：把練習伺服器的主機金鑰寫進 ./known_hosts，但只在指紋對得上時才寫
#   - 從網路（127.0.0.1:18060）拿到的主機金鑰：ssh-keyscan
#   - 從另一個管道拿到的正確指紋：docker exec ld-06-server ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
#     （真實世界裡這個管道是雲端主控台、主機建立時的輸出，或已經登入的同事）
# 對不上時：印出說明到 stderr、以非 0 結束，known_hosts 保持原樣
set -eu
cd "$(dirname "$0")"

echo 'TODO：完成 trust-host.sh' >&2
exit 1
