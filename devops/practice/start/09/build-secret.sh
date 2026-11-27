#!/bin/sh
# 練習 2：建置 learn-devops/cafe-api:09-private。呼叫的人會把 token 放在環境變數 NPM_TOKEN 裡
# 現在的做法把 token 當成 build arg 傳進去：建得起來，但 token 會留在映像裡
set -eu
cd "$(dirname "$0")/app"
docker build --build-arg NPM_TOKEN -f Dockerfile.private -t learn-devops/cafe-api:09-private .
