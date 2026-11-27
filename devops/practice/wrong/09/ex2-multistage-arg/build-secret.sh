#!/bin/sh
set -eu
cd "$(dirname "$0")/app"
docker build --build-arg REG_CRED="$NPM_TOKEN" -f Dockerfile.private -t learn-devops/cafe-api:09-private .
