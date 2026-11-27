#!/bin/sh
# 練習 4：在背景執行 learn-devops/cafe-api:09-1，容器名稱 ld-09-hardened，只發布在 127.0.0.1:18094
# --read-only：映像裡的檔案都不能改；--tmpfs /tmp：只有 /tmp 可寫（放在記憶體，容器停掉就消失）
# --cap-drop ALL：拿掉所有 capability；no-new-privileges：程序不能再取得更多權限（例如透過 setuid 程式）
set -eu
docker run -d --name ld-09-hardened \
  --read-only --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -e TMP_DIR=/tmp \
  -p 127.0.0.1:18094:3000 \
  learn-devops/cafe-api:09-1
