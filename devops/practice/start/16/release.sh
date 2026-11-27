#!/bin/sh
# 練習 1：建置一次、推上 registry
# 用法：sh release.sh <app 的 git repo>（測試會傳入 ex1-repo）
# 要做到：
#   1. repo 的工作目錄有任何未提交的改動（改了沒 commit、新檔案沒 add）就拒絕發佈：印出原因、exit ≠ 0
#   2. 從 repo 建置「一次」映像，同時標記
#        localhost:18160/cafe-api:<7 碼短 SHA>
#        localhost:18160/cafe-api:<package.json 的 version>
#      並加上 OCI label：org.opencontainers.image.revision（完整 SHA）、.version、.created（UTC，ISO 8601）
#   3. 兩個 tag 都推到 localhost:18160
#   4. 在目前資料夾寫 release.json：{ "sha": 完整 SHA, "version": 版本, "digest": "sha256:…"（registry 上的 digest） }
set -eu
repo=${1:?用法：sh release.sh <repo>}

echo 'TODO：完成 release.sh' >&2
exit 1
