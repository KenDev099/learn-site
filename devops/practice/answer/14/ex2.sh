#!/bin/sh
# 用法：sh ex2.sh <repo>（測試會傳入 ex2-repo）
set -e
cd "$1"
git switch -q main
# 用訊息找出那個 commit（^…$ 讓它完全相符，不會抓到別的）
bad=$(git log --format=%H --grep='^feat: new tax rounding$' main)
test -n "$bad"
git show --stat "$bad"
# 新增一個抵銷它的 commit；--no-edit 沿用預設訊息（含 This reverts commit <sha>.）
git revert --no-edit "$bad"
