#!/bin/sh
# 練習 2：止血（要求看課程頁的練習 2）
# 先執行 sh drill.sh 重現事故、查清楚是哪一種問題，再把止血的指令寫在下面。
# 測試會重新執行 drill.sh，然後執行 sh mitigate.sh，再量錯誤率
set -eu
cd "$(dirname "$0")"

