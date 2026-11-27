#!/usr/bin/env bash
# 練習 4：用法：bash run-now.sh
# 不等到 23:30，現在就用 CronJob daily-report 的設定跑一次報表（例如昨晚的報表失敗了要補跑）。
set -euo pipefail
NS=k8s-10-ex4

kubectl create job "daily-report-manual-$(date +%Y%m%d-%H%M%S)" --from=cronjob/daily-report -n "$NS"
