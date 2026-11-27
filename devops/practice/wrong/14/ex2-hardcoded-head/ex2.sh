#!/bin/sh
set -e
cd "$1"
# 數了一次 repo 就寫死位置：壞 commit 後面的 commit 數每次不同
git revert --no-edit HEAD~3
