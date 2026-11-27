#!/bin/sh
# 部署指定版本（不用改）：sh deploy.sh 2.3.1
# 移除舊容器、用新映像啟動 ld-25-api（帶 learn.deployed-by=deploy.sh label），等 /health 通過，記到 state/deploy.log
set -eu
cd "$(dirname "$0")"
v=${1:?用法：sh deploy.sh <版本>，例如 sh deploy.sh 2.3.1}
image=learn-devops/cafe-api:25-$v
docker image inspect "$image" >/dev/null 2>&1 || { echo "找不到映像 $image：先執行 sh drill.sh" >&2; exit 1; }
docker rm -f ld-25-api >/dev/null 2>&1 || true
docker run -d --name ld-25-api --label learn.course=devops --label learn.deployed-by=deploy.sh \
  -p 127.0.0.1:18250:3000 -v "$PWD/state:/etc/cafe:ro" "$image" >/dev/null
i=0
until curl -fsS http://localhost:18250/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 50 ]; then echo "ld-25-api 10 秒內沒有就緒：" >&2; docker logs ld-25-api >&2; exit 1; fi
  sleep 0.2
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy $v image=$(docker inspect -f '{{.Image}}' ld-25-api)" | tee -a state/deploy.log
