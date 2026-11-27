# 錯誤寫法：用 merge 把 main 併進來，不是 rebase（衝突解對了，但分支上多了 merge commit）
set -e
git stash -q
git switch -q -c feat/CAFE-15-sold-out
git apply changes/CAFE-15.patch
git add -A
git commit -q -m 'feat(products): 商品可以標記已售完' -m 'Refs: CAFE-15'
git fetch -q origin
git merge -q origin/main || true
git checkout stash@{0} -- api/prisma/schema.prisma api/prisma/seed.sql api/src/products/products.module.ts
git commit -q --no-edit
git stash drop -q
git push -q -u origin feat/CAFE-15-sold-out
