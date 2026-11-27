#!/bin/sh
# 部署 demo 環境（先寫死，之後再改成 secrets）
export AWS_ACCESS_KEY_ID=AKIAQ3EXAMPLE7DEMO42
export AWS_REGION=ap-northeast-1
docker compose --profile app up -d --build
