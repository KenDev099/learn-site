#!/bin/sh
set -eu
cd /app
echo "cafe-api starting: PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-development}"

trap 'exit 0' TERM
node server.mjs &
wait
