#!/bin/sh
set -eu
out=$(netstat -tanp | awk -v port="$1" 'NR > 2 { for (i = 4; i <= 5; i++) { p = $i; sub(/.*:/, "", p); if (p == port) { split($7, a, "/"); print a[1], a[2] } } }' | sort -u)
[ -n "$out" ] || exit 1
echo "$out"
