#!/usr/bin/env bash
set -euo pipefail
ns="$1"
echo UV_THREADPOOL_SIZE=1
echo NODE_OPTIONS=--max-old-space-size=128
