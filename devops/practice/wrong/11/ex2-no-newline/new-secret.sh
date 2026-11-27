#!/bin/sh
# 錯誤寫法：產生密碼時不寫換行，以為 app 就不用處理結尾換行（config.ts 也沒有去掉）
set -eu
cd "$(dirname "$0")"
umask 077
mkdir -p secrets
openssl rand -hex 24 | tr -d '\n' > secrets/db_password.txt
chmod 600 secrets/db_password.txt
