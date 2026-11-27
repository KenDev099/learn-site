#!/usr/bin/env bash
# 用法：bash deploy.sh <tag>，例如 bash deploy.sh v2
# 用 Helm 把 ./chart 部署成 namespace k8s-13-ex4 裡名為 cafe 的 release。
# 成功以 0 結束；失敗時 Helm 自動回到上一個成功的 revision，腳本以非 0 結束（CI 看到紅燈）
set -euo pipefail
NS=k8s-13-ex4
TAG="${1:?用法：deploy.sh <tag>}"

# TODO：用一個 helm upgrade --install 指令完成部署：
#   - 映像 tag 用 --set 傳入
#   - 等到資源真的 Ready（--wait），最多等 3 分鐘（--timeout）
#   - 失敗就自動回滾（Helm 4 的旗標名稱）
#   - 失敗時印出一行說明，再 exit 1
