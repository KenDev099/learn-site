#!/bin/sh
# 練習 1：在這個資料夾產生一個私有 CA，再用它簽發 localhost 的伺服器憑證
# 產出：ca.key、ca.crt（CA:TRUE）、server.key、server.crt（SAN 含 DNS:localhost 與 IP:127.0.0.1、有效期不超過 200 天、由 ca.crt 簽發）
# 執行：sh make-certs.sh（先用 openssl version 確認你用的是哪一套 openssl）
set -eu

# 1. CA 的私鑰與自簽憑證
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 365 \
  -subj "/CN=Cafe Dev CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

# 2. 伺服器的私鑰與 CSR
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"

# 3. 寫一個擴充欄位檔，用 CA 簽發伺服器憑證
printf '%s\n' \
  'basicConstraints = CA:FALSE' \
  'subjectAltName = DNS:localhost' \
  'extendedKeyUsage = serverAuth' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 90 -extfile server.ext -out server.crt
