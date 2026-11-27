#!/bin/sh
# 錯誤寫法：直接做一張自簽的伺服器憑證，再把它當成 CA
set -eu
openssl req -x509 -newkey rsa:2048 -nodes -keyout server.key -out server.crt -days 90 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
cp server.crt ca.crt
