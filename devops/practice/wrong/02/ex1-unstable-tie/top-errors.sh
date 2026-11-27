#!/usr/bin/env bash
set -euo pipefail
log="$1"
awk '$9 ~ /^5/ { print $7 }' "$log" | sort | uniq -c | sort -rn | head -n 3
