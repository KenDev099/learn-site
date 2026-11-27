#!/bin/sh
# 錯誤寫法：不確認另一個顏色在跑、不先 nginx -t，直接改 active.conf 再 reload
set -eu
cd "$(dirname "$0")"

if grep -q 'ld-16-green' nginx/active.conf; then back=blue; else back=green; fi
echo "upstream api { server ld-16-$back:3000; }" > nginx/active.conf
docker exec ld-16-nginx nginx -s reload
echo "已切回 $back"
