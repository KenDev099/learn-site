#!/bin/bash
# 練習 2：確認 kubectl 指向課程叢集再動手
# 1. 用 kubectl 取得目前的 context
# 2. 不是 kind-learn-k8s：把錯誤訊息印到 stderr（>&2），以 exit 1 結束，而且不能再對叢集下任何指令
# 3. 是 kind-learn-k8s：只印出節點的數量（一個數字）
set -euo pipefail

