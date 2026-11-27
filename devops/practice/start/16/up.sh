#!/bin/sh
# 練習 2 的環境。這個檔案不用改，測試每次也會先跑它
# 用法：sh up.sh
#   1. 啟動本機 registry（127.0.0.1:18160）
#   2. 從 app/ 建置三個版本推上去：v1、v2、v3-bad（/health/ready 永遠 503），印出它們的 digest 參照
#      另外把 v1 也推成 latest（模擬「有人推了 latest」）
#   3. 重建 blue（跑 v1）與 nginx（127.0.0.1:18161），active.conf 重設成 blue；green 不存在
set -eu
cd "$(dirname "$0")"
R=localhost:18160/cafe-api

if [ "$(docker inspect -f '{{.State.Running}}' ld-16-registry 2>/dev/null)" != true ]; then
  docker rm -f -v ld-16-registry >/dev/null 2>&1 || true
  docker run -d --name ld-16-registry -p 127.0.0.1:18160:5000 registry:3.1.2 >/dev/null
fi
until curl -fs http://localhost:18160/v2/ >/dev/null; do sleep 0.3; done

build() {   # build <tag> <APP_VERSION> <BROKEN_READY>
  docker build -q --build-arg APP_VERSION="$2" --build-arg BROKEN_READY="$3" -t "$R:$1" app >/dev/null
  docker push -q "$R:$1" >/dev/null
  echo "$R@$(docker buildx imagetools inspect "$R:$1" --format '{{json .Manifest}}' | sed -n 's/.*"digest": *"\(sha256:[0-9a-f]*\)".*/\1/p' | head -1)"
}
V1=$(build v1 v1 0)
V2=$(build v2 v2 0)
BAD=$(build v3-bad v3-bad 1)
docker tag "$R:v1" "$R:latest" && docker push -q "$R:latest" >/dev/null

docker rm -f -v ld-16-blue ld-16-green ld-16-nginx >/dev/null 2>&1 || true
docker network create ld-16-net >/dev/null 2>&1 || true
echo 'upstream api { server ld-16-blue:3000; }' > nginx/active.conf
docker run -d --name ld-16-blue --network ld-16-net "$V1" >/dev/null
# 整個資料夾掛進去（不是單一檔案）：主機上改寫 active.conf，容器裡才看得到新內容
docker run -d --name ld-16-nginx --network ld-16-net -p 127.0.0.1:18161:80 \
  -v "$PWD/nginx:/etc/nginx/conf.d:ro" nginx:1.30.6-alpine >/dev/null
i=0
until curl -fs http://localhost:18161/health/ready >/dev/null; do
  i=$((i + 1)); [ "$i" -lt 100 ] || { echo 'blue 30 秒內沒有 ready：docker logs ld-16-blue' >&2; exit 1; }
  sleep 0.3
done
echo "V1=$V1"
echo "V2=$V2"
echo "BAD=$BAD"
echo "環境好了：curl http://localhost:18161/version；部署 v2：sh deploy.sh $V2"
