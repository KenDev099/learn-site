#!/bin/sh
# 事故演練（不用改）：sh drill.sh
# 建出 2.3.1 與 2.4.0 → 部署 2.3.1 → 送流量 → 部署 2.4.0 → 送流量 → 告警響了。每次執行都從頭開始
set -eu
cd "$(dirname "$0")"
for v in 2.3.1 2.4.0; do
  docker build -q --build-arg VERSION=$v -t learn-devops/cafe-api:25-$v drill >/dev/null
done
mkdir -p state
printf '{\n  "loyalty": true,\n  "new_checkout": true\n}\n' > state/flags.json
: > state/deploy.log
sh deploy.sh 2.3.1
node drill/load.mjs 1 80
sh deploy.sh 2.4.0
node drill/load.mjs 81 120
echo
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [PAGE] CafeApiErrorBudgetBurnFast：cafe-api 的錯誤比例遠超過 SLO，runbook：https://runbooks.cafe.test/cafe-api/error-budget-burn"
echo "你是值班者。服務在 http://localhost:18250（/metrics、/products、POST /orders），容器是 ld-25-api。"
echo "查 log：docker logs ld-25-api ｜ 部署紀錄：state/deploy.log ｜ 這一版改了什麼：drill/CHANGELOG.md"
