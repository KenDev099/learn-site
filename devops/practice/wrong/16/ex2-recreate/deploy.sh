#!/bin/sh
# 練習 2：零停機藍綠部署
# 用法：sh deploy.sh <依 digest 的映像參照>，例如 sh deploy.sh localhost:18160/cafe-api@sha256:…
set -eu
cd "$(dirname "$0")"

image=${1:?用法：sh deploy.sh <registry>/cafe-api@sha256:…}
case "$image" in
  *@sha256:*) ;;
  *) echo "只接受依 digest 的映像參照（…@sha256:…），收到：$image" >&2; exit 2 ;;
esac
if grep -q 'ld-16-green' nginx/active.conf; then old=green new=blue; else old=blue new=green; fi
timeout=${READY_TIMEOUT:-30}

fail() {
  echo "部署失敗：$1。已移除 ld-16-$new，流量仍在 $old" >&2
  docker rm -f -v "ld-16-$new" >/dev/null 2>&1 || true
  exit 1
}

# 1. 另一個顏色：先移除上一版留下的閒置容器（它早就不在 upstream 裡），再用新映像啟動
# 錯誤寫法：先停舊的再啟動新的
docker stop "ld-16-$old" >/dev/null
docker rm -f -v "ld-16-$new" >/dev/null 2>&1 || true
docker run -d --name "ld-16-$new" --network ld-16-net "$image" >/dev/null || fail "容器啟動失敗"

# 2. 健康關卡：等 /health/ready
i=0
until docker exec ld-16-nginx curl -fs -o /dev/null "http://ld-16-$new:3000/health/ready"; do
  i=$((i + 1))
  [ "$i" -lt $((timeout * 2)) ] || fail "$timeout 秒內 /health/ready 沒有回 200"
  sleep 0.5
done

# 3. 煙霧測試：最重要的讀取路徑要能用
docker exec ld-16-nginx curl -fsS "http://ld-16-$new:3000/products" | grep -q '^\[' || fail "煙霧測試 GET /products 沒過"

# 4. 切換：改 upstream → nginx -t → reload（不是 restart：舊 worker 會處理完手上的請求）
cp nginx/active.conf nginx/active.conf.bak
echo "upstream api { server ld-16-$new:3000; }" > nginx/active.conf
if ! docker exec ld-16-nginx nginx -t -q; then
  mv nginx/active.conf.bak nginx/active.conf
  fail "nginx -t 沒過"
fi
docker exec ld-16-nginx nginx -s reload
rm -f nginx/active.conf.bak

# 5. 舊顏色留著：不在 upstream 裡、不接新請求，rollback.sh 可以立即切回；下一次部署才會換掉它
echo "已切到 $new（$image）；$old 留著，要回滾就執行 sh rollback.sh"
