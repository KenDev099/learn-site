#!/usr/bin/env bash
set -euo pipefail
src="$1"
out="$2"
trap 'rm -f "$out"' ERR
tar -cf - -C "$src" . | gzip > "$out"
