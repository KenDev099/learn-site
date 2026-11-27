#!/bin/sh
# 啟動整套類正式環境（這個檔不用改，測試每次也會先跑它）。用法：sh up.sh
# 1. 產生憑證（certs/）與三個隨機密碼（secrets/，已經有就沿用）
# 2. 建置 1.0.0 版的映像；第一次啟動時建立 .env：藍綠兩組都跑 1.0.0，流量在 blue
# 3. docker compose -f compose.prod.yaml up -d --wait，再等 api 暖機完成
set -eu
cd "$(dirname "$0")"
[ -f certs/server.crt ] || sh make-certs.sh
mkdir -p secrets
for name in postgres_password migrator_password app_password; do
  [ -s "secrets/$name.txt" ] || openssl rand -hex 24 > "secrets/$name.txt"
done
chmod 644 secrets/*.txt   # 容器裡的程式不是 root；只在本機練習這樣做
image=$(sh release.sh 1.0.0)
if [ ! -f .env ]; then
  printf 'BLUE_IMAGE=%s\nGREEN_IMAGE=%s\n' "$image" "$image" > .env
  cp nginx/active.conf nginx/active.conf.tmp && sed 's/api-green:3000/api-blue:3000/' nginx/active.conf.tmp > nginx/active.conf && rm nginx/active.conf.tmp
fi
# Docker Desktop 偶爾還看不到剛建立的 secrets 檔（bind source path does not exist），等一下再試一次
docker compose -f compose.prod.yaml up -d --wait --wait-timeout 180 ||
  { sleep 3; docker compose -f compose.prod.yaml up -d --wait --wait-timeout 180; }
# healthy 只代表程序活著（/health/live）；再等 api 暖機完成、經過 nginx 的 /health/ready 回 200
i=0
until curl -fsS --cacert certs/ca.crt -o /dev/null https://localhost:18263/health/ready 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -lt 120 ] || { echo '60 秒內 https://localhost:18263/health/ready 沒有回 200：看 docker compose -f compose.prod.yaml logs api-blue' >&2; exit 1; }
  sleep 0.5
done
echo "環境好了：curl --cacert certs/ca.crt https://localhost:18263/version"
