#!/usr/bin/env bash
set -euo pipefail
src="$1"
out="$2"
tar -cf - -C "$src" . | gzip > "$out"
