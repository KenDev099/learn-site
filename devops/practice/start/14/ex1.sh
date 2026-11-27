#!/bin/sh
# 用法：sh ex1.sh <repo>（測試會傳入 ex1-repo）
# 目標：把 feature/loyalty rebase 到最新的 main 上，解掉衝突
#   src/pricing.ts：會員 9 折與歡樂時光 8 折都要保留，規則寫在 repo 的 README.md
#   package-lock.json：不要手動合，用 npm 重新產生（加 --no-audit --no-fund 就不必連網）
# rebase 遇到衝突會停下來、以非 0 結束，所以不能直接 set -e 就讓它結束腳本
set -e
cd "$1"
git switch -q feature/loyalty

# TODO
