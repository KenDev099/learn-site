#!/bin/sh
set -e
cd "$1"
# 看了一次 reflog 就寫死編號：reset 之後的 commit 數每次不同，@{N} 會跟著變
git branch rescue 'feature/menu@{2}'
