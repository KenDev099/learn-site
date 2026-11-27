#!/bin/sh
# 用容器執行 OpenTofu，不必在 Mac 上安裝：在 work/20 或它的子資料夾裡執行
#   sh tofu.sh init          （在 plan/ 裡就是 sh ../tofu.sh init）
# 容器掛上 /var/run/docker.sock，所以裡面的 tofu 建立的容器就在你的 Docker Desktop 上。
# 有設定這些環境變數就會傳進容器：TF_VAR_db_password、TF_VAR_api_image、TF_VAR_state_passphrase、TF_ENCRYPTION
set -eu
here=$(cd "$(dirname "$0")" && pwd)
case "$PWD/" in
  "$here"/*) rel=${PWD#"$here"} ;;
  *) echo "請在 $here 或它的子資料夾裡執行" >&2; exit 1 ;;
esac
docker image inspect learn-devops/tofu:1.13.2 >/dev/null 2>&1 ||
  docker build -t learn-devops/tofu:1.13.2 - < "$here/tofu.Dockerfile"
tty=
[ -t 0 ] && tty=-it
exec docker run --rm $tty -v /var/run/docker.sock:/var/run/docker.sock -v "$here":/work -w "/work$rel" \
  -e TF_VAR_db_password -e TF_VAR_api_image -e TF_VAR_state_passphrase -e TF_ENCRYPTION \
  learn-devops/tofu:1.13.2 "$@"
