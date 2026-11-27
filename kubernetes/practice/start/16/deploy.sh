#!/usr/bin/env bash
# 練習 2：用法：bash deploy.sh <版本>，例如 bash deploy.sh v1。namespace 預設 k8s-16，可以用 NS=... 覆寫
# 要做的事：1. 跑這一版的 migration（失敗就停）→ 2. helm 更新應用（失敗自動回滾）→ 3. 煙霧測試
set -euo pipefail
cd "$(dirname "$0")"
NS="${NS:-k8s-16}"
VERSION="${1:?用法：bash deploy.sh <版本>}"
JOB="cafe-migrate-$VERSION"

echo "TODO：還沒寫" >&2
exit 1
