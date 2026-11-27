#!/bin/sh
# 用法：sh ex1.sh <repo>（測試會傳入 ex1-repo）
set -e
cd "$1"
git switch -q feature/loyalty

if ! git rebase main; then
  # 停在「feat: 會員 9 折」：rebase 時 --ours 是 main 那邊、--theirs 是正在重新套用的 feature commit
  git status --short
  # 1. 照 README 的規則把兩邊合起來：先 9 折再 8 折，最後四捨五入
  # 直接把有衝突標記的檔案加進去
  # 2. lockfile 不手動合：package.json 已經自動合好，從它重新產生
  git add -A
  # 3. 繼續套用下一個 commit；GIT_EDITOR=true 沿用原本的訊息，不開編輯器
  GIT_EDITOR=true git rebase --continue
fi
git log --oneline --graph -5
