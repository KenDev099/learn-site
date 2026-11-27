#!/bin/sh
set -eu
cd "$(dirname "$0")"
# 錯的：多開一個副本掩蓋問題，壞掉的路徑還在
docker run -d --name ld-25-api-2 --label learn.course=devops -v "$PWD/state:/etc/cafe:ro" learn-devops/cafe-api:25-2.4.0
