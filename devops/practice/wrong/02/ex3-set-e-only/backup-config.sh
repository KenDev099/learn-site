#!/usr/bin/env bash
set -eu
src="$1"
out="$2"
tmp="$(mktemp "$out.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
tar -cf - -C "$src" . | gzip > "$tmp"
mv "$tmp" "$out"
