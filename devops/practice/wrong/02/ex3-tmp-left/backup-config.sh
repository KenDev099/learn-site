#!/usr/bin/env bash
set -euo pipefail
src="$1"
out="$2"
tmp="$out.tmp"
tar -cf - -C "$src" . | gzip > "$tmp"
mv "$tmp" "$out"
