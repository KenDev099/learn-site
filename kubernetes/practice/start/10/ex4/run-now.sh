#!/usr/bin/env bash
# 練習 4：用法：bash run-now.sh
# 不等到 23:30，現在就用 CronJob daily-report 的設定跑一次報表（例如昨晚的報表失敗了要補跑）。
set -euo pipefail
NS=k8s-10-ex4

# TODO：從 cronjob/daily-report 建立一個新的 Job，名稱每次都不一樣。不要另外寫一份 Job YAML
