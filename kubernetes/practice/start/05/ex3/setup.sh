#!/bin/bash
# 練習 3：產生測試用的 CA 與 cafe.test 的伺服器憑證，再把憑證和金鑰放進叢集的 tls Secret cafe-tls
# 用法（在 learn/ 執行）：bash kubernetes/practice/work/05/ex3/setup.sh k8s-05-ex3
# 要求：
# - 檔案產生在這個資料夾：ca.key、ca.crt（CA）、server.key、server.crt（SAN 要有 DNS:cafe.test，由 ca.crt 簽發）
# - Secret 用 kubectl 從檔案建立，金鑰不能寫進任何 YAML 檔
# - 重複執行也要成功（Secret 已經存在時改成更新）
set -euo pipefail
cd "$(dirname "$0")"
NS="${1:-k8s-05-ex3}"

# 1. CA 的私鑰與自簽憑證（devops 課第 5 課）


# 2. cafe.test 的私鑰與 CSR


# 3. 用 CA 簽發，加上 SAN


# 4. 建立（或更新）tls Secret cafe-tls

