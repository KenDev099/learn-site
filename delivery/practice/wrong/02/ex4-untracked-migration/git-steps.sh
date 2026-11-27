# 錯誤寫法：git add -u 只加了改過的檔案，新的 migration 資料夾沒有進 commit
# （其他步驟同標準答案）
set -e
git stash -q
git switch -q -c feat/CAFE-15-sold-out
git apply changes/CAFE-15.patch
git add -u
git commit -q -m 'feat(products): 商品可以標記已售完' -m '店員用 PATCH /products/:id/sold-out 標記，菜單仍列出售完的商品、不能加入購物車。程式由阿哲撰寫。' -m 'Refs: CAFE-15'
git fetch -q origin
if git rebase origin/main; then echo '預期 rebase 會衝突' >&2; exit 1; fi
git checkout stash@{0} -- api/prisma/schema.prisma api/prisma/seed.sql api/src/products/products.module.ts
GIT_EDITOR=true git rebase --continue
git stash drop -q
git push -q -u origin feat/CAFE-15-sold-out
