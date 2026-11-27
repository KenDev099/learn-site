# 錯誤寫法：衝突標記沒清掉就 git add、rebase --continue
set -e
git switch -q -c feat/CAFE-15-sold-out
git checkout -q -- .
git apply changes/CAFE-15.patch
git add -A
git commit -q -m 'feat(products): 商品可以標記已售完' -m 'Refs: CAFE-15'
git fetch -q origin
git rebase origin/main || true
git add -A
GIT_EDITOR=true git rebase --continue
git push -q -u origin feat/CAFE-15-sold-out
