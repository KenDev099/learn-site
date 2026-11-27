# 錯誤寫法：rebase 之前推過一次，rebase 之後沒有 --force-with-lease（push 被拒絕，origin 上還是舊的）
set -e
git stash -q
git switch -q -c feat/CAFE-15-sold-out
git apply changes/CAFE-15.patch
git add -A
git commit -q -m 'feat(products): 商品可以標記已售完' -m 'Refs: CAFE-15'
git push -q -u origin feat/CAFE-15-sold-out
git fetch -q origin
git rebase origin/main || true
git checkout stash@{0} -- api/prisma/schema.prisma api/prisma/seed.sql api/src/products/products.module.ts
GIT_EDITOR=true git rebase --continue
git stash drop -q
git push -q origin feat/CAFE-15-sold-out 2>/dev/null || true
