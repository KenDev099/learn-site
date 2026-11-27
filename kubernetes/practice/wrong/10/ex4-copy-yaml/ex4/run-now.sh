#!/usr/bin/env bash
# 錯誤寫法：另外複製一份 Job YAML，CronJob 改了這裡不會跟著改
set -euo pipefail
cd "$(dirname "$0")"
kubectl create -n k8s-10-ex4 -f job-copy.yaml
