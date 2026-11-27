#!/bin/sh
# 練習 2：產生資料庫密碼，寫到 secrets/db_password.txt
set -eu
cd "$(dirname "$0")"
umask 077                     # 接下來建立的檔案只有自己能讀寫（600）、資料夾 700
mkdir -p secrets
echo "cafe-dev-password-2026" > secrets/db_password.txt
chmod 600 secrets/db_password.txt   # 檔案原本就存在時 umask 不會改它的權限
