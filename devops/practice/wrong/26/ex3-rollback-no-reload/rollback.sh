#!/bin/sh
# 練習 3：立即回滾到另一個顏色（上一版）。用法：sh rollback.sh
set -eu
cd "$(dirname "$0")"
dc() { docker compose -f compose.prod.yaml "$@"; }

if grep -q 'api-green:3000' nginx/active.conf; then back=blue; else back=green; fi
# 另一個顏色的副本都要在跑、而且 ready，才切過去
ids=$(dc ps -q "api-$back")
[ -n "$ids" ] || { echo "api-$back 沒有在跑，沒辦法立即回滾：用上一版的映像執行 deploy.sh" >&2; exit 1; }
for c in $ids; do
  docker exec "$c" wget -qO /dev/null http://127.0.0.1:3000/health/ready 2>/dev/null \
    || { echo "api-$back 的 $c 沒有 ready，不切換" >&2; exit 1; }
done

cp nginx/active.conf nginx/active.conf.bak
sed "s/api-[a-z]*:3000/api-$back:3000/" nginx/active.conf.bak > nginx/active.conf
if ! dc exec -T nginx nginx -t -q; then
  mv nginx/active.conf.bak nginx/active.conf
  echo 'nginx -t 沒過，沒有切換' >&2
  exit 1
fi
rm -f nginx/active.conf.bak
echo "已切回 $back"
