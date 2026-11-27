#!/bin/sh
# 錯誤：其他都對，卻關掉了預設的 seccomp
set -eu
docker run -d --name ld-09-hardened --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined -e TMP_DIR=/tmp -p 127.0.0.1:18094:3000 learn-devops/cafe-api:09-1
