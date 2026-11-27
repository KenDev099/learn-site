#!/bin/sh
# 練習 2：建置 learn-devops/cafe-api:09-private。呼叫的人會把 token 放在環境變數 NPM_TOKEN 裡
# --secret 把環境變數 NPM_TOKEN 交給 BuildKit，id 是 npm_token；只有掛載它的那一步看得到
set -eu
cd "$(dirname "$0")/app"
docker build --secret id=npm_token,env=NPM_TOKEN -f Dockerfile.private -t learn-devops/cafe-api:09-private .
