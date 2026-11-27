#!/bin/sh
# 練習 3：產出給 amd64 伺服器用的 learn-devops/cafe-api:09-amd64
# 現在這樣會建出跟這台 Mac 一樣的 arm64 映像
set -eu
cd "$(dirname "$0")/app"
docker build -t learn-devops/cafe-api:09-amd64 .
