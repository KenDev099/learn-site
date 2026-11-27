#!/usr/bin/env bash
set -euo pipefail
kubectl port-forward -n k8s-04-ex4 svc/cafe-api 18404:80 >/dev/null 2>&1 &
pid=$!
trap 'kill $pid' EXIT
sleep 4
curl -sS --retry 5 --retry-all-errors --retry-delay 1 http://localhost:18404/version
