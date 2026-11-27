#!/bin/sh
# 練習 2 用的憑證：在 certs/ 裡產生私有 CA 與 localhost 的伺服器憑證（第 5 課練習 1 的做法）
# 測試每次都會先執行一次；自己試的時候執行 sh make-certs.sh
set -eu
mkdir -p certs && cd certs

# 1. CA 的私鑰與自簽憑證
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 365 \
  -subj "/CN=Cafe Dev CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

# 2. 伺服器的私鑰與 CSR
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"

# 3. 寫一個擴充欄位檔，用 CA 簽發伺服器憑證
printf '%s\n' \
  'basicConstraints = CA:FALSE' \
  'subjectAltName = DNS:localhost, IP:127.0.0.1' \
  'extendedKeyUsage = serverAuth' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 90 -extfile server.ext -out server.crt
