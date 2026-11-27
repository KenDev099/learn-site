#!/bin/sh
# 練習 3：產出給 amd64 伺服器用的 learn-devops/cafe-api:09-amd64
# 目標平台寫在指令上；Dockerfile 裡的建置階段用 $BUILDPLATFORM 留在這台 Mac 的架構
set -eu
cd "$(dirname "$0")/app"
docker build --platform linux/amd64 -t learn-devops/cafe-api:09-amd64 .
