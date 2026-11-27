#!/bin/sh
# 練習 2：立即回滾
# 用法：sh rollback.sh
set -eu
cd "$(dirname "$0")"

if grep -q 'ld-16-green' nginx/active.conf; then back=blue; else back=green; fi
if [ "$(docker inspect -f '{{.State.Running}}' "ld-16-$back" 2>/dev/null)" != true ]; then
  echo "ld-16-$back 沒有在跑，沒辦法立即回滾：用上一版的 digest 執行 deploy.sh" >&2
  exit 1
fi
cp nginx/active.conf nginx/active.conf.bak
echo "upstream api { server ld-16-$back:3000; }" > nginx/active.conf
if ! docker exec ld-16-nginx nginx -t -q; then
  mv nginx/active.conf.bak nginx/active.conf
  echo 'nginx -t 沒過，沒有切換' >&2
  exit 1
fi
docker exec ld-16-nginx nginx -s reload
rm -f nginx/active.conf.bak
echo "已切回 $back"
