#!/bin/sh
# 練習 3：立即回滾到另一個顏色（上一版）。用法：sh rollback.sh
set -eu
cd "$(dirname "$0")"
dc() { docker compose -f compose.prod.yaml "$@"; }

if grep -q 'api-green:3000' nginx/active.conf; then back=blue; else back=green; fi
cp nginx/active.conf nginx/active.conf.bak
sed "s/api-[a-z]*:3000/api-$back:3000/" nginx/active.conf.bak > nginx/active.conf
if ! dc exec -T nginx nginx -t -q; then
  mv nginx/active.conf.bak nginx/active.conf
  echo 'nginx -t 沒過，沒有切換' >&2
  exit 1
fi
dc exec -T nginx nginx -s reload
rm -f nginx/active.conf.bak
echo "已切回 $back"
