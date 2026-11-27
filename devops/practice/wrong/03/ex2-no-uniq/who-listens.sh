#!/bin/sh
set -eu
out=$(netstat -ltnp | awk -v port="$1" 'NR > 2 { p = $4; sub(/.*:/, "", p); if (p == port) { split($7, a, "/"); print a[1], a[2] } }')
[ -n "$out" ] || exit 1
echo "$out"
