#!/bin/sh
# 練習 1：產生這個練習專用的金鑰對，並把公鑰放進 authorized_keys（server/up.sh 會把它裝到伺服器上）
# 要求：
#   - 私鑰在 keys/id_ed25519、公鑰在 keys/id_ed25519.pub，類型 ed25519，私鑰權限 600
#   - 已經有金鑰時不要重新產生（重產會讓伺服器上的舊公鑰失效）
#   - 不要碰 ~/.ssh 裡你自己的金鑰
set -eu
cd "$(dirname "$0")"

echo 'TODO：完成 keygen.sh' >&2
exit 1
