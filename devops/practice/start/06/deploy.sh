#!/bin/sh
# 練習 2：把 app/ 部署到 cafe-server 並交給 systemd。要可以重複執行，每次執行後跑的都是最新的程式碼
#   1. app/ 傳到 /opt/cafe-api/（ubuntu 可以寫入）
#   2. cafe-api.service 裝到 /etc/systemd/system/，cafe-api.env 裝到 /etc/cafe-api.env（擁有者 root、權限 600）
#   3. 讓 systemd 讀到新的 unit、設成開機自動啟動、用新的程式碼（重新）啟動
# 所有 ssh／scp／rsync 都透過 ssh_config 的 cafe-server
set -eu
cd "$(dirname "$0")"

echo 'TODO：完成 deploy.sh' >&2
exit 1
