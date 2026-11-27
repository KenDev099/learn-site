#!/bin/sh
# 建置一個版本的映像（這個檔不用改）。用法：sh release.sh <版本> [app 資料夾，預設 app]
# 映像名稱 learn-devops/cafe-api:26-<版本>；最後一行印出映像參照，給 deploy.sh 用
# 正式環境是 CI 建置、推到 registry，部署用 registry@sha256:…（第 16 課）；這裡在本機建置，用 tag 代替
set -eu
cd "$(dirname "$0")"
version=${1:?用法：sh release.sh <版本> [app 資料夾]}
src=${2:-app}
image=learn-devops/cafe-api:26-$version
docker build -q --build-arg APP_VERSION="$version" --build-arg GIT_SHA="${GIT_SHA:-local-$version}" -t "$image" "$src" >/dev/null
echo "$image"
