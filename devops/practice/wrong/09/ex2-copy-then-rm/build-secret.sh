#!/bin/sh
set -eu
cd "$(dirname "$0")/app"
printf '%s' "$NPM_TOKEN" > npm-token.txt
trap 'rm -f npm-token.txt' EXIT
docker build -f Dockerfile.private -t learn-devops/cafe-api:09-private .
