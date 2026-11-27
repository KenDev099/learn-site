#!/bin/sh
set -eu
cd "$(dirname "$0")"
# 錯的：進容器手動改程式
docker exec -u root ld-25-api sed -i "s/flags.new_checkout ?/false ?/" /app/server.mjs
docker restart ld-25-api
