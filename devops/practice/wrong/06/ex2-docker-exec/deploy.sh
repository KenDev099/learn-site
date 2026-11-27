#!/bin/sh
# 錯誤：繞過 SSH，直接用 docker 以 root 身分操作「伺服器」（真的雲端主機沒有這條路）
set -eu
cd "$(dirname "$0")"
docker cp app/. ld-06-server:/opt/cafe-api/
docker cp cafe-api.service ld-06-server:/etc/systemd/system/cafe-api.service
docker cp cafe-api.env ld-06-server:/etc/cafe-api.env
docker exec ld-06-server sh -c 'chown root:root /etc/cafe-api.env && chmod 600 /etc/cafe-api.env && systemctl daemon-reload && systemctl enable cafe-api && systemctl restart cafe-api'
