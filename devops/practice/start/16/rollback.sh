#!/bin/sh
# 練習 2：立即回滾
# 用法：sh rollback.sh
# 把 nginx/active.conf 切回另一個顏色（上一版還在跑的那個），nginx -t 通過後 reload
# 那個顏色的容器沒在跑時，不要切換，exit ≠ 0
set -eu
cd "$(dirname "$0")"

echo 'TODO：完成 rollback.sh' >&2
exit 1
