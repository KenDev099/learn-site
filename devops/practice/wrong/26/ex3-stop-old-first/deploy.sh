#!/bin/sh
# 練習 3：零停機藍綠部署。用法：sh deploy.sh <映像>，例如 sh deploy.sh "$(sh release.sh 2.0.0)"
set -eu
cd "$(dirname "$0")"
image=${1:?用法：sh deploy.sh <映像>}
dc() { docker compose -f compose.prod.yaml "$@"; }

if grep -q 'api-green:3000' nginx/active.conf; then old=green new=blue; else old=blue new=green; fi
var=$(echo "$new" | tr a-z A-Z)_IMAGE
timeout=${READY_TIMEOUT:-60}

fail() {
  echo "部署失敗：$1。流量仍在 $old" >&2
  # 新顏色退回原本的映像，留給 rollback.sh 用
  if [ -f .env.bak ]; then mv .env.bak .env; dc up -d --no-deps "api-$new" >/dev/null 2>&1 || true; fi
  exit 1
}

# 1. 先用新映像跑 migration（cafe_migrator）。只做向後相容的變更（第 17 課），舊版照常服務
MIGRATE_IMAGE=$image dc run --rm --no-deps migrate || fail "migration 失敗"

dc stop "api-$old"

# 2. 把新映像寫進 .env：之後任何人執行 docker compose 都看到同一個狀態
#    --force-recreate：一律換成全新的容器（映像沒變也一樣，輪替密碼時靠它讀到新的密碼檔）
cp .env .env.bak
sed "s|^$var=.*|$var=$image|" .env.bak > .env
dc up -d --no-deps --force-recreate --wait --wait-timeout "$timeout" "api-$new" || fail "api-$new 沒有變成 healthy"

# 3. 健康關卡：每個新副本的 /health/ready 都要 200（DB、Redis 連得上，這個版本的 migration 都在）
i=0
for c in $(dc ps -q "api-$new"); do
  until docker exec "$c" wget -qO /dev/null http://127.0.0.1:3000/health/ready 2>/dev/null; do
    i=$((i + 1)); [ "$i" -lt $((timeout * 2)) ] || fail "$timeout 秒內 /health/ready 沒有回 200"
    sleep 0.5
  done
  # 4. 煙霧測試：最重要的讀取路徑
  docker exec "$c" wget -qO- http://127.0.0.1:3000/products | grep -q '拿鐵' || fail "煙霧測試 GET /products 沒過"
done

# 5. 切流量：改 upstream → nginx -t → reload（舊 worker 處理完手上的請求才結束）
cp nginx/active.conf nginx/active.conf.bak
cat > nginx/active.conf <<CONF
# 現在接流量的顏色。deploy.sh 與 rollback.sh 改寫這個檔，再 nginx -t、nginx -s reload
upstream api {
    zone api 64k;
    resolver 127.0.0.11 valid=5s ipv6=off;
    server api-$new:3000 resolve max_fails=2 fail_timeout=5s;
}
CONF
if ! dc exec -T nginx nginx -t -q; then
  mv nginx/active.conf.bak nginx/active.conf
  fail "nginx -t 沒過"
fi
dc exec -T nginx nginx -s reload
rm -f nginx/active.conf.bak .env.bak

# 6. 舊顏色留著，rollback.sh 可以立即切回；下一次部署才會換掉它
echo "已切到 $new（$image）；$old 留著，要回滾就執行 sh rollback.sh"
