#!/usr/bin/env bash
set -euo pipefail
ns="$1"
grep -E 'UV_THREADPOOL_SIZE|NODE_OPTIONS' deployment.yaml || true
