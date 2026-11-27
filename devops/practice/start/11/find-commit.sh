#!/bin/sh
# 練習 4：印出 $1 這個 repo 裡「第一次加入」字串 $2 的 commit 完整 SHA（40 個字元），只印一行
set -eu
git -C "$1" log --format=%H -1
