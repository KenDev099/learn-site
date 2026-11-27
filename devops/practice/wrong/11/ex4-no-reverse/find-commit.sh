#!/bin/sh
# 練習 4：印出 $1 這個 repo 裡「第一次加入」字串 $2 的 commit 完整 SHA（40 個字元），只印一行
set -eu
# -S 找「這個字串出現次數有變」的 commit：加入和刪除的都會列出，--reverse 讓最舊的（加入的）排第一
git -C "$1" log -S"$2" --format=%H | head -n 1
