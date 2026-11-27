#!/usr/bin/env bash
set -euo pipefail
src="$1"
out="$2"
tmp="$(mktemp "$out.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
tar -cf - -C "$src" . | gzip > "$tmp" || true
mv "$tmp" "$out"
