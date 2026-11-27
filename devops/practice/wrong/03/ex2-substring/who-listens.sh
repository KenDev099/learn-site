#!/bin/sh
set -eu
out=$(netstat -ltnp | grep "$1" | awk '{ split($7, a, "/"); print a[1], a[2] }' | sort -u)
[ -n "$out" ] || exit 1
echo "$out"
