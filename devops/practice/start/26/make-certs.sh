#!/bin/sh
# 練習 2、3 用的憑證：在 certs/ 裡產生私有 CA 與伺服器憑證（第 5 課的做法）。這個檔不用改
# 伺服器憑證的名稱：localhost（從主機連）、nginx（壓測的 k6 在 compose 網路裡連）
# 測試每次都會先執行；自己試的時候執行 sh make-certs.sh
set -eu
cd "$(dirname "$0")"
mkdir -p certs && cd certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 365 -subj "/CN=Cafe Dev CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost" 2>/dev/null
printf '%s\n' 'basicConstraints = CA:FALSE' 'subjectAltName = DNS:localhost, DNS:nginx, IP:127.0.0.1' \
  'extendedKeyUsage = serverAuth' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 90 -extfile server.ext -out server.crt 2>/dev/null
# nginx 的 worker 不是 root：私鑰要讀得到（只在本機練習這樣做；正式環境的私鑰權限要收緊）
chmod 644 server.key
