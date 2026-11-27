#!/usr/bin/env bash
set -euo pipefail
NS=k8s-13-ex4
TAG="${1:?用法：deploy.sh <tag>}"
helm template cafe ./chart -n "$NS" --set image.tag="$TAG" | kubectl apply -n "$NS" -f -
kubectl rollout status -n "$NS" deployment/cafe --timeout=180s
