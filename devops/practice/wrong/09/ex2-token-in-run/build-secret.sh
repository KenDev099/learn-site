#!/bin/sh
set -eu
cd "$(dirname "$0")/app"
sed "s/__NPM_TOKEN__/$NPM_TOKEN/" Dockerfile.private | docker build -f - -t learn-devops/cafe-api:09-private .
