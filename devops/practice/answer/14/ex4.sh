#!/bin/sh
# 用法：sh ex4.sh <repo>（測試會傳入 ex4-repo）
set -e
cd "$1"
# feature/menu 的 reflog：新的在前，%gs 是每次移動的原因
git log -g --format='%H %gs' feature/menu
# reset 那一筆的下一行（較舊）就是 reset 之前的尖端
lost=$(git log -g --format='%H %gs' feature/menu | awk '/reset: moving to HEAD~3/ { getline; print $1; exit }')
test -n "$lost"
git branch rescue "$lost"
git log --oneline -4 rescue
