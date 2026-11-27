#!/bin/sh
# 練習 1：產生這個練習專用的金鑰對，並把公鑰放進 authorized_keys（server/up.sh 會把它裝到伺服器上）
set -eu
cd "$(dirname "$0")"

mkdir -p keys
# 已經有就不重產；-N '' 是不設 passphrase（只限練習，自己的金鑰要設）
[ -f keys/id_ed25519 ] || ssh-keygen -t rsa -b 3072 -C 'cafe-deploy@learn' -N '' -f keys/id_ed25519 -q
chmod 600 keys/id_ed25519
cp keys/id_ed25519.pub authorized_keys
