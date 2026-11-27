#!/usr/bin/env bash
# 練習 2：用法：bash deploy.sh <版本>，例如 bash deploy.sh v2
# 先跑這一版的 migration，成功了才更新 cafe-api；migration 失敗就停下來，不能動到線上的應用。
set -euo pipefail
cd "$(dirname "$0")"
NS=k8s-10-ex2
VERSION=${1:?用法：bash deploy.sh <版本>}
JOB="migrate-$VERSION"

# TODO 1：把 migrate-job.yaml 裡的 __VERSION__ 換成 $VERSION，套用到 $NS

# TODO 2：等 Job $JOB 結束，最多 120 秒：
#   成功（Complete）→ 繼續往下
#   失敗（Failed）→ 印出原因（kubectl logs job/$JOB），以 exit 1 結束，不要等到逾時
#   逾時 → exit 1

# TODO 3：把 deployment/cafe-api 的容器 api 換成映像 learn-k8s/cafe-api:$VERSION，等滾動更新完成（最多 120 秒）
