#!/bin/sh
set -e
cd "$1"
# HEAD@{1} 只往回一步：同事 reset 之後又 commit 過，拿到的不是 reset 之前的位置
git branch rescue 'feature/menu@{1}'
