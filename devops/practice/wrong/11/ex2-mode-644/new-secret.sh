#!/bin/sh
# 練習 2：產生資料庫密碼，寫到 secrets/db_password.txt
set -eu
cd "$(dirname "$0")"
mkdir -p secrets
openssl rand -hex 24 > secrets/db_password.txt
