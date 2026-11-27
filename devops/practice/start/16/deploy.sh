#!/bin/sh
# 練習 2：零停機藍綠部署
# 用法：sh deploy.sh <依 digest 的映像參照>，例如 sh deploy.sh localhost:18160/cafe-api@sha256:…
# 參數不是 …@sha256:… 的參照（例如給了 tag）就拒絕：exit ≠ 0，什麼都不動
# 步驟：
#   1. 看 nginx/active.conf 判斷目前作用中的顏色（blue 或 green），新版本放到另一個顏色
#   2. 移除另一個顏色上一版留下的閒置容器，用參數給的映像啟動 ld-16-<新顏色>（網路 ld-16-net，不發布 port）
#   3. 等新容器的 /health/ready 回 200，最多 READY_TIMEOUT 秒（預設 30）
#   4. 煙霧測試：GET /products 要回 200 與 JSON 陣列
#   5. 改寫 nginx/active.conf 指向新顏色，nginx -t 通過後 nginx -s reload
#   6. 舊顏色的容器留著不動（給 rollback.sh 立即切回）
# 任何一步失敗：exit ≠ 0、移除失敗的新容器、active.conf 維持原樣，讓目前的顏色繼續服務
# 提示：容器沒有發布 port，可以從 nginx 容器裡連：docker exec ld-16-nginx curl -fsS http://ld-16-green:3000/health/ready
set -eu
cd "$(dirname "$0")"

echo 'TODO：完成 deploy.sh' >&2
exit 1
