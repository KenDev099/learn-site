#!/bin/sh
set -eu
cd "$(dirname "$0")"
# 錯的：整個旗標檔被覆蓋，其他旗標（loyalty）跟著不見
printf '{"new_checkout": false}\n' > state/flags.json
docker kill --signal HUP ld-25-api
