#!/usr/bin/env bash
# 用法：bash rollback.sh [revision]：不給 revision 就回到上一個 revision。資料庫不回滾：migration 都是 expand，舊版照樣能跑
set -euo pipefail
NS="${NS:-k8s-16}"
helm rollback cafe ${1:+"$1"} -n "$NS" --wait --timeout 3m
helm history cafe -n "$NS" --max 3
