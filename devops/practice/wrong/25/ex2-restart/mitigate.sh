#!/bin/sh
set -eu
cd "$(dirname "$0")"
# 錯的：重啟壞掉的版本，旗標還開著
docker restart ld-25-api
