#!/bin/bash
# 沒檢查 context 就直接查
set -euo pipefail
kubectl get nodes --no-headers | wc -l | tr -d ' '
