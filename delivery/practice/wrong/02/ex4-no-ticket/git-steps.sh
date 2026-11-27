# 錯誤寫法：commit 訊息沒有寫需求單編號 CAFE-15
# （其他步驟同標準答案）
set -e
git stash -q
git switch -q -c feat/CAFE-15-sold-out
git apply changes/CAFE-15.patch
git add -A
git commit -q -m 'feat(products): 商品可以標記已售完'
git fetch -q origin
if git rebase origin/main; then echo '預期 rebase 會衝突' >&2; exit 1; fi
git checkout stash@{0} -- api/prisma/schema.prisma api/prisma/seed.sql api/src/products/products.module.ts
GIT_EDITOR=true git rebase --continue
git stash drop -q
git push -q -u origin feat/CAFE-15-sold-out
