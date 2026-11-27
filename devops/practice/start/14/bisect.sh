#!/bin/sh
# 用法：sh bisect.sh <repo>（測試會傳入 ex3-repo）；目前資料夾是 work/14
# repo 的 main 上約 200 個 commit：tag v1.0 是好的，main 的訂單金額算錯了（node --test 會失敗）
# 有一些中間的 commit 連語法都是錯的（node --check src/order.js 失敗），那些 commit 沒辦法判斷好壞
# 目標：用 git bisect run 找出第一個壞 commit，把完整 SHA 寫進目前資料夾的 answer.txt，最後回到 main
set -e
repo=$1

# TODO
