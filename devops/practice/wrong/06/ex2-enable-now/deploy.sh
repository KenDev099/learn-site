#!/bin/sh
# 把 app/ 部署到 cafe-server，交給 systemd 看管。可以重複執行
set -eu
cd "$(dirname "$0")"
SSH="ssh -F ssh_config"

# 1. 程式碼：rsync 只傳有變的檔案，--delete 刪掉伺服器上多出來的舊檔
rsync -a --delete -e "$SSH" app/ cafe-server:/opt/cafe-api/

# 2. unit 檔和 env 檔先放到暫存位置，再用 sudo 以 root 身分裝到正確的地方、設好擁有者和權限
scp -F ssh_config cafe-api.service cafe-api.env cafe-server:/tmp/
$SSH cafe-server '
  set -e
  sudo install -o root -g root -m 644 /tmp/cafe-api.service /etc/systemd/system/cafe-api.service
  sudo install -o root -g root -m 600 /tmp/cafe-api.env /etc/cafe-api.env
  rm /tmp/cafe-api.service /tmp/cafe-api.env
  sudo systemctl daemon-reload
  sudo systemctl enable --now cafe-api
  systemctl is-active cafe-api
'
