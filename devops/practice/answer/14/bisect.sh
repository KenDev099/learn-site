#!/bin/sh
# 用法：sh bisect.sh <repo>（測試會傳入 ex3-repo）；目前資料夾是 work/14
set -e
repo=$1
# 先壞後好：main 是壞的，v1.0 是好的
git -C "$repo" bisect start main v1.0
# 每一步在 repo 裡執行：建置不起來就 exit 125（跳過），否則測試的結束碼就是答案（0 好、1 壞）
git -C "$repo" bisect run sh -c 'node --check src/order.js || exit 125; node --test'
# 找到之後 refs/bisect/bad 指著第一個壞 commit
git -C "$repo" rev-parse refs/bisect/bad > answer.txt
git -C "$repo" bisect reset
