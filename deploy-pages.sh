#!/bin/sh
# 把目前 HEAD 的內容（不含 commit 歷史）推到公開的 KenDev099/learn-site，
# GitHub Pages 會自動更新 https://kendev099.github.io/learn-site/
# 這個 repo（learn）維持 private；公開的那邊每次只有一個快照 commit。
set -eu
export GIT_AUTHOR_NAME=KenDev099 GIT_COMMITTER_NAME=KenDev099
export GIT_AUTHOR_EMAIL=125956682+KenDev099@users.noreply.github.com
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL
commit=$(git commit-tree 'HEAD^{tree}' -m "deploy $(git rev-parse --short HEAD)")
git push --force https://github.com/KenDev099/learn-site.git "$commit:refs/heads/main"
