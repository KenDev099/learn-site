#!/usr/bin/env bash
set -euo pipefail
ns="$1"
pod=$(kubectl get pod -n "$ns" -l app=cafe-hash -o jsonpath="{.items[0].metadata.name}")
kubectl debug -n "$ns" "pod/$pod" --image=busybox:1.38.0 --target=api --attach --quiet -- env </dev/null 2>/dev/null | grep -E "^(UV_THREADPOOL_SIZE|NODE_OPTIONS)=" || true
