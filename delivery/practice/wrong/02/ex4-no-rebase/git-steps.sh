# 錯誤寫法：沒有 fetch、沒有 rebase，直接把照舊 main 做的分支推上去
set -e
git switch -q -c feat/CAFE-15-sold-out
git checkout -q -- .
git apply changes/CAFE-15.patch
git add -A
git commit -q -m 'feat(products): 商品可以標記已售完' -m 'Refs: CAFE-15'
git push -q -u origin feat/CAFE-15-sold-out
