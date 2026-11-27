#!/bin/sh
# 用法：sh ex4.sh <repo>（測試會傳入 ex4-repo）
# 同事在 feature/menu 上執行了 git reset --hard HEAD~3，之後又 commit 了幾次（每次次數不同）
# 目標：用 reflog 找到 reset 之前的位置，建立 rescue 分支指向它；feature/menu 本身不要動
set -e
cd "$1"

# TODO
