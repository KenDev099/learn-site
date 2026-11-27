#!/bin/sh
# 練習 1：建置一次、推上 registry
# 用法：sh release.sh <app 的 git repo>（測試會傳入 ex1-repo）
set -eu
repo=${1:?用法：sh release.sh <repo>}
image=localhost:18160/cafe-api

# 1. 只發佈 commit 過的東西：有改動或沒追蹤的檔案（它們也會被 COPY 進映像）就停
if [ -n "$(git -C "$repo" status --porcelain)" ]; then
  echo '工作目錄不乾淨，拒絕發佈。先 commit 或清掉這些改動：' >&2
  git -C "$repo" status --short >&2
  exit 1
fi
sha=$(git -C "$repo" rev-parse HEAD)
short=$(git -C "$repo" rev-parse --short=7 HEAD)
version=$(cd "$repo" && node -p "require('./package.json').version")

# 2. 建置一次，同時打兩個 tag；label 記錄這個映像從哪個 commit 來
docker build \
  --label org.opencontainers.image.revision="$sha" \
  --label org.opencontainers.image.version="$version" \
  --label org.opencontainers.image.created="$(date +%Y-%m-%dT%H:%M:%S)" \
  -t "$image:$short" -t "$image:$version" "$repo"

# 3. 推同一個映像的兩個 tag
docker push "$image:$short"
docker push "$image:$version"

# 4. 問 registry 這個 tag 的 digest，之後的部署都用它
digest=$(docker buildx imagetools inspect "$image:$short" --format '{{json .Manifest}}' \
  | sed -n 's/.*"digest": *"\(sha256:[0-9a-f]*\)".*/\1/p' | head -1)
printf '{ "sha": "%s", "version": "%s", "digest": "%s" }\n' "$sha" "$version" "$digest" > release.json
echo "已發佈 $image@$digest（$short、$version）"
