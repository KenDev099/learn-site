#!/bin/sh
set -e
cd "$1"
lost=$(git log -g --format='%H %gs' feature/menu | awk '/reset: moving to HEAD~3/ { getline; print $1; exit }')
# 照內容重做：從現在的 feature/menu 開新分支，把 3 個 commit cherry-pick 過來（SHA 會不同）
git switch -q -c rescue feature/menu
git cherry-pick -X theirs "$lost~3..$lost"
